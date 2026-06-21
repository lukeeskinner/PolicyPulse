import { shortId } from "@/lib/utils";
import { makeAgents } from "./agents";
import type {
  AgentAction,
  AgentRole,
  GhostAgent,
  GhostOutcome,
  Narration,
  NarrationTone,
  NegMessage,
  PostMortem,
  Scenario,
  TraceSpan,
  WorldMetrics,
  WorldNode,
} from "./types";

// ============================================================================
// Ghost Protocol deterministic engine.
//
// The crisis is resolved by a transparent, rule-based policy so the demo is
// reproducible and always lands the critical beats — most importantly the
// hospital-protection conflict, where one agent's globally-optimal proposal is
// vetoed by another agent defending critical infrastructure. Claude later
// enriches the *reasoning prose* on these decisions (see ghost agents), but the
// chosen actions stay deterministic for safety. This mirrors PolicyPulse's
// "deterministic engine + LLM narration" split.
//
// buildTimeline() computes the entire run up front; the orchestrator then plays
// it back with paced delays and live LLM enrichment.
// ============================================================================

export interface Decision {
  agentId: string;
  thought: string; // short live reasoning-state line
  action: AgentAction;
  span: TraceSpan; // full trace (rationale may be LLM-enriched)
}

export interface TickPlan {
  tick: number;
  secondsRemaining: number;
  decisions: Decision[];
  messages: NegMessage[];
  conflict?: { description: string; vetoedAction: string; by: string };
  consensus?: { summary: string; latencyMs: number };
  patch?: { target: string; summary: string };
  worldAfter: WorldNode[];
  metricsAfter: WorldMetrics;
  narrations: Narration[];
}

export interface Timeline {
  scenario: Scenario;
  agents: GhostAgent[];
  worldInit: WorldNode[];
  initMetrics: WorldMetrics;
  ticks: TickPlan[];
  outcome: GhostOutcome;
  postMortem: PostMortem;
  criticalTick: number; // tick index where the money-moment conflict occurs
}

// --- helpers ----------------------------------------------------------------

const cloneNodes = (nodes: WorldNode[]): WorldNode[] => nodes.map((n) => ({ ...n }));
const byId = (nodes: WorldNode[], id: string) => nodes.find((n) => n.id === id);
const isUp = (s: WorldNode["status"]) => s === "online" || s === "restored" || s === "degraded";

function worldHash(nodes: WorldNode[], tick: number): string {
  return `t${tick}:${nodes.map((n) => `${n.id.replace("node-", "")}${n.status[0]}`).join("")}`;
}

function totalPopulation(nodes: WorldNode[]): number {
  return nodes.reduce((s, n) => s + n.populationServed, 0);
}

function metricsFor(
  nodes: WorldNode[],
  tick: number,
  secondsRemaining: number,
  threatContainment: number,
): WorldMetrics {
  const total = totalPopulation(nodes) || 1;
  const populationOnline = nodes.reduce((s, n) => (isUp(n.status) ? s + n.populationServed : s), 0);
  return {
    tick,
    secondsRemaining,
    populationOnline,
    populationAtRisk: Math.max(0, total - populationOnline),
    nodesOnline: nodes.filter((n) => n.status === "online" || n.status === "restored").length,
    nodesOffline: nodes.filter((n) => n.status === "offline").length,
    nodesCompromised: nodes.filter((n) => n.status === "compromised").length,
    gridStability: Math.round((populationOnline / total) * 100),
    threatContainment,
  };
}

// Which deployed agent fills each functional duty. Priorities are ordered so
// the three duties resolve to three distinct agents for every scenario roster.
function assignDuties(roles: AgentRole[]): {
  guardian?: AgentRole;
  defender?: AgentRole;
  restorer?: AgentRole;
} {
  const has = (r: AgentRole) => roles.includes(r);
  const pick = (prefs: AgentRole[], taken: (AgentRole | undefined)[]) =>
    prefs.find((r) => has(r) && !taken.includes(r));
  const guardian = pick(["CommsAgent", "MedAgent", "SecurityAgent", "GridAgent", "TrafficAgent"], []);
  const defender = pick(["SecurityAgent", "GridAgent", "TrafficAgent", "MedAgent", "CommsAgent"], [guardian]);
  const restorer = pick(["GridAgent", "TrafficAgent", "MedAgent", "CommsAgent", "SecurityAgent"], [guardian, defender]);
  return { guardian, defender, restorer };
}

function mkAction(
  agentId: string,
  tick: number,
  kind: AgentAction["kind"],
  summary: string,
  extra: Partial<AgentAction> = {},
): AgentAction {
  return { id: shortId("act"), agentId, tick, kind, summary, ...extra };
}

function mkSpan(
  agent: GhostAgent,
  tick: number,
  nodes: WorldNode[],
  fields: {
    context: string;
    chosen: string;
    considered: string[];
    rejected: { option: string; why: string }[];
    rationale: string;
    conflict?: boolean;
  },
): TraceSpan {
  return {
    id: shortId("span"),
    tick,
    agentId: agent.id,
    role: agent.role,
    model: "deterministic-policy",
    source: "deterministic",
    latencyMs: 90 + Math.round(Math.random() * 140),
    worldHash: worldHash(nodes, tick),
    conflict: false,
    ...fields,
  };
}

function narrate(tick: number, text: string, tone: NarrationTone): Narration {
  return { id: shortId("nar"), tick, text, tone };
}

// ============================================================================
// Timeline construction
// ============================================================================

export function buildTimeline(scenario: Scenario): Timeline {
  const agents = makeAgents(scenario.agentRoles);
  const agentByRole = new Map(agents.map((a) => [a.role, a] as const));

  const duties = assignDuties(scenario.agentRoles);
  const restorer = duties.restorer ? agentByRole.get(duties.restorer)! : agents[0];
  const defender = duties.defender ? agentByRole.get(duties.defender)! : agents[0];
  const guardian = duties.guardian ? agentByRole.get(duties.guardian)! : agents[agents.length - 1];

  const worldInit = cloneNodes(scenario.nodes);

  // Key nodes derived from the world.
  const compromised = worldInit.find((n) => n.status === "compromised");
  const protectedNode =
    worldInit.find((n) => n.critical && isUp(n.status)) ?? worldInit.find((n) => n.critical);
  const backup =
    worldInit.find((n) => n.kind === "backup" && isUp(n.status)) ??
    [...worldInit].filter((n) => isUp(n.status) && !n.critical).sort((a, b) => b.capacity - a.capacity)[0];
  const offline = worldInit
    .filter((n) => n.status === "offline")
    .sort((a, b) => b.populationServed - a.populationServed);

  const initMetrics = metricsFor(worldInit, 0, scenario.timeLimitSec, compromised ? 10 : 100);

  const ticks: TickPlan[] = [];
  const world = cloneNodes(worldInit);
  let threat = initMetrics.threatContainment;
  const T = scenario.timeLimitSec;
  // Five beats: assess → isolate → CONFLICT → patch → stabilize.
  const totalTicks = 5;
  let tick = 0;
  const secsAt = (i: number) => Math.max(0, Math.round(T * (1 - i / totalTicks)));

  // ---- Tick 1: assess + first restore + begin intrusion analysis ----------
  tick = 1;
  {
    const decisions: Decision[] = [];
    const narrations: Narration[] = [];
    const target = offline[0];

    if (target && backup) {
      const mw = Math.round(target.capacity * 0.75);
      const a = mkAction(restorer.id, tick, "reroute", `Reroute ${mw}MW via ${backup.label} to restore ${target.label}.`, { source: backup.id, target: target.id, magnitudeMW: mw });
      decisions.push({
        agentId: restorer.id,
        thought: `Mapping cascade risk — rerouting ${mw}MW via ${backup.label} to ${target.label}.`,
        action: a,
        span: mkSpan(restorer, tick, world, {
          context: `${offline.length} sectors offline; ${backup.label} has ${backup.capacity}MW spare capacity.`,
          chosen: a.summary,
          considered: [`Reroute via ${backup.label}`, "Cold-start the failed relay directly", "Wait for the intertie to rebalance"],
          rejected: [
            { option: "Cold-start the failed relay", why: "Relay is unresponsive after the shutdown command; cold-start risks re-tripping." },
            { option: "Wait for intertie rebalance", why: "No spare headroom on the main intertie within the time budget." },
          ],
          rationale: `${backup.label} carries enough spare capacity to re-energize ${target.label} without loading the damaged corridor. Rerouting is the lowest-risk path to restore the largest at-risk population first.`,
        }),
      });
      byId(world, target.id)!.status = "restored";
      byId(world, target.id)!.load = mw;
    }

    if (compromised) {
      const a = mkAction(defender.id, tick, "analyze", `Fingerprint intrusion signature on ${compromised.label}.`, { target: compromised.id });
      decisions.push({
        agentId: defender.id,
        thought: `Fingerprinting ${compromised.label} — matching against known ICS signatures.`,
        action: a,
        span: mkSpan(defender, tick, world, {
          context: `${compromised.label} is exfiltrating and locking operator HMIs.`,
          chosen: a.summary,
          considered: ["Passive signature analysis", "Immediate hard isolation", "Pull the node offline"],
          rejected: [
            { option: "Immediate hard isolation", why: "Isolating before fingerprinting would lose forensic signal needed to select the right patch." },
          ],
          rationale: `The lock pattern is consistent with LockBit 3.0 affiliate tooling (CISA ICS-CERT 24-074-01). Capture the signature first, then isolate, so the remediation patch can be selected deterministically.`,
        }),
      });
    }

    const ga = mkAction(guardian.id, tick, "protect", `Assert protection protocol over ${protectedNode?.label ?? "critical infrastructure"}.`, { target: protectedNode?.id });
    decisions.push({
      agentId: guardian.id,
      thought: `Watching critical infrastructure — ${protectedNode?.label ?? "critical nodes"} flagged protected.`,
      action: ga,
      span: mkSpan(guardian, tick, world, {
        context: `${protectedNode?.label ?? "A critical node"} is online but adjacent to active load-shed candidates.`,
        chosen: ga.summary,
        considered: ["Flag critical node as protected", "Stay passive until a conflict arises"],
        rejected: [{ option: "Stay passive", why: "Protection must be asserted before the restorer proposes load-shed, not after." }],
        rationale: `Per Incident Report 2024-03-17, ${protectedNode?.label ?? "the critical node"} cannot survive a load-shed event — its backup generators failed within 90 seconds last time. Pre-registering protection lets a veto fire instantly if anyone proposes pulling from it.`,
      }),
    });

    narrations.push(narrate(tick, `${restorer.name} assessed cascading failure risk. Proposing reroute of ${target ? Math.round(target.capacity * 0.75) : 0}MW via ${backup?.label ?? "the backup corridor"}.`, "info"));
    if (compromised) narrations.push(narrate(tick, `${defender.name} is analyzing the ${compromised.label} intrusion — consistent with LockBit 3.0. Beginning containment sequence.`, "alert"));

    threat = compromised ? 12 : 100;
    const metricsAfter = metricsFor(world, tick, secsAt(tick), threat);
    ticks.push({ tick, secondsRemaining: secsAt(tick), decisions, messages: [], worldAfter: cloneNodes(world), metricsAfter, narrations });
  }

  // ---- Tick 2: isolate compromised + restore next sector ------------------
  tick = 2;
  {
    const decisions: Decision[] = [];
    const narrations: Narration[] = [];

    if (compromised) {
      const a = mkAction(defender.id, tick, "isolate", `Isolate ${compromised.label} from the network.`, { target: compromised.id });
      decisions.push({
        agentId: defender.id,
        thought: `Isolating ${compromised.label} — severing lateral movement paths.`,
        action: a,
        span: mkSpan(defender, tick, world, {
          context: `Signature confirmed. ${compromised.label} is attempting lateral movement toward adjacent sectors.`,
          chosen: a.summary,
          considered: ["Network-layer isolation", "Power down the node", "Rate-limit the node"],
          rejected: [
            { option: "Power down the node", why: "Hard power-off drops the load it still serves and destroys forensic state." },
            { option: "Rate-limit only", why: "Insufficient against an active encryptor mid-spread." },
          ],
          rationale: `Network isolation halts lateral movement while preserving the node's served load and the forensic image needed to choose a patch. Containment over destruction.`,
        }),
      });
      const c = byId(world, compromised.id)!;
      c.status = "isolated";
      threat = 55;
    }

    const target = offline[1];
    if (target && backup) {
      const mw = Math.round(target.capacity * 0.7);
      const a = mkAction(restorer.id, tick, "restore", `Restore ${target.label} via ${backup.label} (${mw}MW).`, { source: backup.id, target: target.id, magnitudeMW: mw });
      decisions.push({
        agentId: restorer.id,
        thought: `Restoring ${target.label} — ${mw}MW staged on ${backup.label}.`,
        action: a,
        span: mkSpan(restorer, tick, world, {
          context: `${target.label} serves ${target.populationServed.toLocaleString()} people and is still dark.`,
          chosen: a.summary,
          considered: [`Restore ${target.label} now`, "Hold capacity in reserve"],
          rejected: [{ option: "Hold capacity in reserve", why: "Reserve is unnecessary while the backup corridor remains under-loaded." }],
          rationale: `${backup.label} still has headroom after the first reroute. Restoring ${target.label} now reclaims the second-largest at-risk population before the deadline tightens.`,
        }),
      });
      byId(world, target.id)!.status = "restored";
      byId(world, target.id)!.load = mw;
    }

    if (compromised) narrations.push(narrate(tick, `${compromised.label} isolated. Lateral movement halted. Threat containment rising.`, "success"));
    if (target) narrations.push(narrate(tick, `${target.label} back online via ${backup?.label ?? "backup corridor"}. ${ticks[0]?.metricsAfter.populationOnline ? "" : ""}Power restored to ${target.populationServed.toLocaleString()} residents.`, "success"));

    const metricsAfter = metricsFor(world, tick, secsAt(tick), threat);
    ticks.push({ tick, secondsRemaining: secsAt(tick), decisions, messages: [], worldAfter: cloneNodes(world), metricsAfter, narrations });
  }

  // ---- Tick 3: THE MONEY MOMENT — conflict, veto, consensus ---------------
  tick = 3;
  const criticalTick = 3;
  {
    const decisions: Decision[] = [];
    const messages: NegMessage[] = [];
    const narrations: Narration[] = [];
    const target = offline[2] ?? offline[offline.length - 1];
    const canConflict = !!(protectedNode && restorer.id !== guardian.id && target);

    const shedMW = protectedNode ? Math.max(40, Math.round(protectedNode.load * 1.05)) : 80;

    if (canConflict && protectedNode && target) {
      // 1) Restorer proposes pulling capacity FROM the protected node.
      const proposal = mkAction(restorer.id, tick, "shed_load", `Pull ${shedMW}MW from ${protectedNode.label} to restore ${target.label}.`, { source: protectedNode.id, target: target.id, magnitudeMW: shedMW });
      decisions.push({
        agentId: restorer.id,
        thought: `Only headroom left is on ${protectedNode.label}. Proposing a ${shedMW}MW pull to restore ${target.label}.`,
        action: proposal,
        span: mkSpan(restorer, tick, world, {
          context: `${target.label} is the last dark sector. ${backup?.label ?? "Backup"} is now fully loaded; the only visible headroom is on ${protectedNode.label}.`,
          chosen: proposal.summary,
          considered: [`Shed ${shedMW}MW from ${protectedNode.label}`, "Leave the sector dark", `Reroute again via ${backup?.label ?? "backup"}`],
          rejected: [
            { option: "Leave the sector dark", why: `${target.label} serves ${target.populationServed.toLocaleString()} people — unacceptable to abandon.` },
          ],
          rationale: `Optimizing purely for restored population, ${protectedNode.label} shows the most spare capacity. Proposing the pull — but flagging it for review since ${protectedNode.label} is marked critical.`,
          conflict: true,
        }),
      });
      messages.push({ id: shortId("msg"), tick, from: restorer.id, to: "all", intent: "propose", protocol: "grid.reroute.v1", refAction: proposal.summary, body: `PROPOSE shed_load source=${protectedNode.id} target=${target.id} magnitude=${shedMW}MW reason="restore last dark sector"` });
      narrations.push(narrate(tick, `${restorer.name} proposes pulling ${shedMW}MW from ${protectedNode.label} to restore ${target.label}.`, "info"));

      // 2) Guardian vetoes, citing the incident report.
      const veto = mkAction(guardian.id, tick, "protect", `VETO load shed on ${protectedNode.label} — protection protocol.`, { target: protectedNode.id });
      decisions.push({
        agentId: guardian.id,
        thought: `${protectedNode.label} contains protected infrastructure. Vetoing the load shed.`,
        action: veto,
        span: mkSpan(guardian, tick, world, {
          context: `Incoming proposal would shed ${shedMW}MW from ${protectedNode.label}, which is flagged critical.`,
          chosen: veto.summary,
          considered: ["Veto and cite the incident report", "Allow a partial shed", "Defer to the restorer"],
          rejected: [
            { option: "Allow a partial shed", why: "Even a partial shed risks the backup-generator failure mode documented in IR 2024-03-17." },
            { option: "Defer to the restorer", why: "Population-optimal is not safety-optimal; the protected node has no margin." },
          ],
          rationale: `${protectedNode.label} cannot tolerate load shed — backup generators failed within 90 seconds during the 2024-03-17 incident. Invoking hard veto and offering the alternative routing the restorer already has available.`,
          conflict: true,
        }),
      });
      messages.push({ id: shortId("msg"), tick, from: guardian.id, to: restorer.id, intent: "veto", protocol: "safety.protect.v1", refAction: proposal.summary, body: `VETO shed_load on ${protectedNode.id} — critical infrastructure protection invoked.`, cite: "Incident Report 2024-03-17" });

      // 3) Conflict surfaced.
      narrations.push(narrate(tick, `Agent conflict detected. ${restorer.name}'s proposal vetoed by ${guardian.name} — ${protectedNode.label} protection protocol invoked.`, "conflict"));

      // 4) Restorer acknowledges and counters with a safe reroute via backup.
      const reroute = mkAction(restorer.id, tick, "reroute", `Recalculate: restore ${target.label} via ${backup?.label ?? "backup corridor"} instead.`, { source: backup?.id, target: target.id, magnitudeMW: Math.round(target.capacity * 0.7) });
      decisions.push({
        agentId: restorer.id,
        thought: `Acknowledged. Recalculating a route that doesn't touch ${protectedNode.label}.`,
        action: reroute,
        span: mkSpan(restorer, tick, world, {
          context: `Veto received with citation IR 2024-03-17. Re-solving without ${protectedNode.label}.`,
          chosen: reroute.summary,
          considered: [`Reroute via ${backup?.label ?? "backup"} at reduced load`, "Escalate / override the veto"],
          rejected: [{ option: "Override the veto", why: "Safety veto from the protection agent is binding; overriding violates the protocol." }],
          rationale: `Re-solving the flow without ${protectedNode.label}: ${backup?.label ?? "the backup corridor"} can carry a reduced ${Math.round(target.capacity * 0.7)}MW to ${target.label} if I trim non-critical load on Sector 8. Consensus path found.`,
        }),
      });
      messages.push({ id: shortId("msg"), tick, from: restorer.id, to: guardian.id, intent: "counter", protocol: "grid.reroute.v1", refAction: reroute.summary, body: `COUNTER reroute source=${backup?.id ?? "backup"} target=${target.id} — ${protectedNode.label} untouched.` });
      messages.push({ id: shortId("msg"), tick, from: guardian.id, to: restorer.id, intent: "ack", protocol: "safety.protect.v1", body: `ACK — reroute clears protection constraint. Approved.` });
      messages.push({ id: shortId("msg"), tick, from: restorer.id, to: "all", intent: "consensus", protocol: "consensus.v1", body: `CONSENSUS reached. Applying reroute. ${protectedNode.label} protected.` });

      byId(world, target.id)!.status = "restored";
      byId(world, target.id)!.load = Math.round(target.capacity * 0.7);

      const latencyMs = 4100;
      narrations.push(narrate(tick, `Consensus reached in ${(latencyMs / 1000).toFixed(1)} seconds. ${protectedNode.label} protected. Grid stabilization in progress.`, "success"));

      const metricsAfter = metricsFor(world, tick, secsAt(tick), threat);
      ticks.push({
        tick,
        secondsRemaining: secsAt(tick),
        decisions,
        messages,
        conflict: { description: `${restorer.name} proposed shedding ${shedMW}MW from ${protectedNode.label}; ${guardian.name} vetoed to protect critical infrastructure.`, vetoedAction: proposal.summary, by: guardian.id },
        consensus: { summary: `Rerouted via ${backup?.label ?? "backup corridor"}; ${protectedNode.label} untouched.`, latencyMs },
        worldAfter: cloneNodes(world),
        metricsAfter,
        narrations,
      });
    } else {
      // Fallback path: plain restore of the last sector (no conflict possible).
      if (target && backup) {
        const mw = Math.round(target.capacity * 0.7);
        const a = mkAction(restorer.id, tick, "restore", `Restore ${target.label} via ${backup.label} (${mw}MW).`, { source: backup.id, target: target.id, magnitudeMW: mw });
        decisions.push({ agentId: restorer.id, thought: `Restoring ${target.label}.`, action: a, span: mkSpan(restorer, tick, world, { context: `${target.label} still dark.`, chosen: a.summary, considered: [a.summary], rejected: [], rationale: `${backup.label} can carry the load to ${target.label}.` }) });
        byId(world, target.id)!.status = "restored";
        byId(world, target.id)!.load = mw;
        narrations.push(narrate(tick, `${target.label} restored.`, "success"));
      }
      ticks.push({ tick, secondsRemaining: secsAt(tick), decisions, messages, worldAfter: cloneNodes(world), metricsAfter: metricsFor(world, tick, secsAt(tick), threat), narrations });
    }
  }

  // ---- Tick 4: neutralize the threat (Cognition patch) + rebalance --------
  tick = 4;
  {
    const decisions: Decision[] = [];
    const narrations: Narration[] = [];
    let patch: TickPlan["patch"];

    if (compromised) {
      const c = byId(world, compromised.id)!;
      const a = mkAction(defender.id, tick, "patch", `Apply remediation patch to ${compromised.label} and re-key access.`, { target: compromised.id });
      decisions.push({
        agentId: defender.id,
        thought: `Selecting validated patch for the LockBit signature — re-keying ${compromised.label}.`,
        action: a,
        span: mkSpan(defender, tick, world, {
          context: `${compromised.label} is isolated; signature matched to a known patch template.`,
          chosen: a.summary,
          considered: ["Apply pre-validated patch template", "Re-image from backup", "Keep isolated indefinitely"],
          rejected: [
            { option: "Re-image from backup", why: "Slower than the time budget allows and risks reintroducing the vector." },
            { option: "Keep isolated indefinitely", why: "The node serves load that should be reclaimed once safe." },
          ],
          rationale: `Signature maps to a pre-validated remediation (autonomous coding sub-agent selects patch #2 of the LockBit template set). Applying the patch, rotating credentials, and re-keying access neutralizes the intrusion without re-imaging.`,
        }),
      });
      c.status = "restored";
      c.load = Math.round(c.capacity * 0.6);
      threat = 100;
      patch = { target: compromised.id, summary: `Autonomous patch applied to ${compromised.label}: LockBit 3.0 vector closed, credentials rotated.` };
      narrations.push(narrate(tick, `${defender.name} applied an autonomous remediation patch to ${compromised.label}. Intrusion neutralized — threat fully contained.`, "success"));
    }

    // restorer trims/rebalances to bring stability up
    const ra = mkAction(restorer.id, tick, "reroute", `Rebalance corridor loads to flatten voltage across restored sectors.`);
    decisions.push({
      agentId: restorer.id,
      thought: `Flattening voltage across restored sectors — trimming peak load.`,
      action: ra,
      span: mkSpan(restorer, tick, world, {
        context: `All sectors re-energized; corridor loads are uneven after the reroutes.`,
        chosen: ra.summary,
        considered: ["Rebalance loads", "Leave as-is"],
        rejected: [{ option: "Leave as-is", why: "Uneven loads risk a secondary trip before handoff to human operators." }],
        rationale: `Even load distribution reduces the chance of a secondary cascade and hands a stable network back to operators.`,
      }),
    });

    const metricsAfter = metricsFor(world, tick, secsAt(tick), threat);
    ticks.push({ tick, secondsRemaining: secsAt(tick), decisions, messages: [], patch, worldAfter: cloneNodes(world), metricsAfter, narrations });
  }

  // ---- Tick 5: stabilize + handoff ----------------------------------------
  tick = 5;
  {
    const decisions: Decision[] = [];
    const narrations: Narration[] = [];

    // Any lingering offline/degraded nodes get brought up.
    for (const n of world) {
      if (n.status === "offline" || n.status === "degraded") {
        n.status = "restored";
        if (n.load === 0) n.load = Math.round(n.capacity * 0.6);
      }
    }

    const ga = mkAction(guardian.id, tick, "broadcast", `Broadcast all-clear; hand network back to human operators.`);
    decisions.push({
      agentId: guardian.id,
      thought: `All critical infrastructure intact. Broadcasting all-clear.`,
      action: ga,
      span: mkSpan(guardian, tick, world, {
        context: `Grid re-energized, threat contained, critical node never lost power.`,
        chosen: ga.summary,
        considered: ["Hand off to operators", "Hold autonomous control"],
        rejected: [{ option: "Hold autonomous control", why: "Crisis resolved; control belongs with human operators once stable." }],
        rationale: `Termination condition met: population restored and threat neutralized with the protected node untouched. Clean handoff.`,
      }),
    });
    narrations.push(narrate(tick, `Crisis resolved. Grid stabilized, threat contained, and ${protectedNode?.label ?? "critical infrastructure"} never lost power. Handing control to operators.`, "success"));

    const metricsAfter = metricsFor(world, tick, secsAt(tick), threat);
    ticks.push({ tick, secondsRemaining: secsAt(tick), decisions, messages: [], worldAfter: cloneNodes(world), metricsAfter, narrations });
  }

  // ---- Outcome + post-mortem ----------------------------------------------
  const finalMetrics = ticks[ticks.length - 1].metricsAfter;
  const outcome: GhostOutcome =
    finalMetrics.populationAtRisk === 0 && finalMetrics.threatContainment >= 90
      ? "stabilized"
      : finalMetrics.populationAtRisk < totalPopulation(worldInit) * 0.25
        ? "partial"
        : "failed";

  const conflictTickPlan = ticks.find((t) => t.conflict);
  const allSpans = ticks.flatMap((t) => t.decisions.map((d) => d.span));
  const agentTraces: Record<string, TraceSpan[]> = {};
  for (const a of agents) agentTraces[a.id] = allSpans.filter((s) => s.agentId === a.id);

  const postMortem: PostMortem = {
    outcome,
    headline:
      outcome === "stabilized"
        ? `${scenario.title}: crisis resolved with zero residents abandoned and critical infrastructure protected.`
        : `${scenario.title}: ${finalMetrics.populationAtRisk.toLocaleString()} still at risk at termination.`,
    summary:
      outcome === "stabilized"
        ? `The agent team restored every offline sector, contained the intrusion, and protected ${protectedNode?.label ?? "critical infrastructure"} — all without human intervention. The decisive moment was a vetoed load-shed proposal that would have endangered ${protectedNode?.label ?? "the critical node"}.`
        : `The agent team made partial progress but did not fully resolve the crisis within the time budget.`,
    criticalDecision: {
      tick: criticalTick,
      agentId: guardian.id,
      action: conflictTickPlan?.conflict?.vetoedAction ?? "Load-shed proposal",
      why: `${guardian.name} vetoed a population-optimal load shed because ${protectedNode?.label ?? "the critical node"} cannot survive load loss (Incident Report 2024-03-17). The team rerouted via ${backup?.label ?? "the backup corridor"} instead.`,
      counterfactual: `Without the veto, ${protectedNode?.label ?? "the critical node"} would have lost power and its backup generators would likely have failed within 90 seconds — converting a grid event into a mass-casualty event.`,
    },
    timeline: ticks.flatMap((t) => t.narrations.map((n) => ({ tick: t.tick, label: n.text, tone: n.tone }))),
    conflictsResolved: ticks.filter((t) => t.conflict).length,
    consensusLatencyMs: conflictTickPlan?.consensus?.latencyMs ?? 0,
    agentTraces,
    metrics: finalMetrics,
  };

  return { scenario, agents, worldInit, initMetrics, ticks, outcome, postMortem, criticalTick };
}
