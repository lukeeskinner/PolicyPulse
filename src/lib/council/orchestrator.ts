import { integrationStatus } from "@/lib/ghost/integrations";
import { analyzePolicy, prepare, runOnce } from "@/lib/headless";
import { clamp, fmtPct, runId as makeRunId, shortId, sleep } from "@/lib/utils";
import {
  chairFraming,
  chairVerdict,
  closingVote,
  councilModelId,
  openingPosition,
  reactToAmendment,
} from "./brain";
import { emit, createRun } from "./bus";
import { buildBrief, constituentOutcome, snapshot } from "./grounding";
import { chairOf, seatsOf, selectPanel } from "./stakeholders";
import type {
  Amendment,
  CastVote,
  ConstituentOutcome,
  CouncilEvent,
  CouncilIntegrationStatus,
  CouncilOutcome,
  CouncilRequest,
  CouncilRunMeta,
  CouncilStepId,
  CouncilTone,
  CouncilTraceSpan,
  DebateMessage,
  ImpactSnapshot,
  Position,
  Stakeholder,
  StakeholderDelta,
  StakeholderPhase,
  StepStatus,
  Verdict,
} from "./types";

// ============================================================================
// Stakeholder Council orchestrator — a real, grounded deliberation.
//
// PolicyPulse's engine simulates the bill first; the panel then argues over the
// MEASURED outcome. Any amendment the panel adopts is RE-SIMULATED on the same
// population + seed, so the before/after the council achieves is proven, not
// claimed. Mirrors the Ghost Protocol orchestrator's event-driven shape.
// ============================================================================

const WALL_CAP_MS = 150_000;
const D = { phase: 240, step: 180, fan: 90 };

function councilIntegrations(): CouncilIntegrationStatus {
  const g = integrationStatus();
  return {
    anthropic: g.anthropic,
    deepgram: g.deepgram,
    redis: g.redis,
    census: !!process.env.CENSUS_API_KEY,
    fetchai: g.fetchai,
    orkes: g.orkes,
    arize: g.arize,
  };
}

export function runCouncilDeliberation(req: CouncilRequest): string {
  const id = makeRunId();
  const meta: CouncilRunMeta = {
    runId: id,
    policy: req.policy,
    jurisdiction: req.jurisdiction,
    title: "Stakeholder Council",
    createdAt: Date.now(),
    status: "running",
  };
  createRun(meta);
  void execute(id, meta, req);
  return id;
}

async function execute(id: string, meta: CouncilRunMeta, req: CouncilRequest): Promise<void> {
  const startedAt = Date.now();
  const now = () => Date.now();
  const out = (e: CouncilEvent) => emit(e);
  const narrate = (round: number, text: string, tone: CouncilTone) =>
    out({ type: "narration", runId: id, narration: { id: shortId("nar"), round, text, tone }, ts: now() });
  const step = (s: CouncilStepId, status: StepStatus) => out({ type: "step", runId: id, step: s, status, ts: now() });
  const phase = (stakeholderId: Stakeholder["id"], p: StakeholderPhase, thought?: string) =>
    out({ type: "stakeholder_phase", runId: id, stakeholderId, phase: p, thought, ts: now() });

  const spans: CouncilTraceSpan[] = [];
  const mkSpan = (
    seat: Stakeholder,
    round: number,
    latencyMs: number,
    source: "llm" | "deterministic",
    chosen: string,
    considered: string[],
    rejected: { option: string; why: string }[],
    rationale: string,
    conflict: boolean,
    context: string,
  ): CouncilTraceSpan => {
    const span: CouncilTraceSpan = {
      id: shortId("span"),
      round,
      stakeholderId: seat.id,
      model: source === "llm" ? councilModelId() : "grounded-heuristic",
      source,
      latencyMs,
      context,
      chosen,
      considered,
      rejected,
      rationale,
      conflict,
    };
    spans.push(span);
    out({ type: "trace_span", runId: id, span, ts: now() });
    return span;
  };

  try {
    out({ type: "run_started", runId: id, meta, integrations: councilIntegrations(), ts: now() });

    // ----- 1) GROUND: simulate the bill on a representative population --------
    step("ground", "running");
    narrate(0, `Simulating "${req.policy.slice(0, 60)}${req.policy.length > 60 ? "…" : ""}" on a digital twin of ${req.jurisdiction}.`, "info");
    const agentCount = clamp(Math.round(req.agentCount ?? 60), 24, 120);
    const seed = `${req.jurisdiction}:${req.policy}:${agentCount}`;
    const { profile, model } = await prepare({ policy: req.policy, jurisdiction: req.jurisdiction, stateCode: req.stateCode });
    const base = runOnce(profile, model, agentCount, seed);
    meta.title = model.title;

    const panel = selectPanel(model.type);
    const chair = chairOf(panel);
    const seats = seatsOf(panel);
    const brief = buildBrief({ jurisdiction: req.jurisdiction, profile, model, analysis: base.analysis, agents: base.agents, panel });
    const baseById: Record<string, ConstituentOutcome> = Object.fromEntries(brief.outcomes.map((o) => [o.stakeholderId, o]));
    out({ type: "grounding_ready", runId: id, brief, ts: now() });
    step("ground", "done");
    narrate(0, `On a twin of ${brief.populationLabel}: ${brief.headline}`, "alert");
    await sleep(D.phase);

    // ----- 2) CONVENE --------------------------------------------------------
    step("convene", "running");
    out({ type: "council_convened", runId: id, stakeholders: panel, ts: now() });
    for (const s of panel) phase(s.id, "idle");
    out({
      type: "debate_msg",
      runId: id,
      message: {
        id: shortId("msg"),
        round: 0,
        from: chair.id,
        to: "floor",
        intent: "gavel",
        protocol: "council.convene.v1",
        body: `Hearing convened on "${model.title}". Seated: ${seats.map((s) => s.name).join(", ")}.`,
      },
      ts: now(),
    });
    step("convene", "done");
    await sleep(D.phase);

    // ----- 3) OPENING POSITIONS (parallel) -----------------------------------
    step("positions", "running");
    for (const s of seats) phase(s.id, "reviewing");
    await sleep(D.fan);
    const amendments: Amendment[] = [];
    const positions: Position[] = [];
    const openings = await Promise.all(seats.map((s) => openingPosition(s, brief, baseById[s.id])));

    for (let i = 0; i < seats.length; i++) {
      const s = seats[i];
      const o = openings[i];
      phase(s.id, "reasoning", o.argument);
      let amendmentId: string | undefined;
      if (o.amendment && o.stance !== "support") {
        const a: Amendment = {
          id: shortId("amd"),
          by: s.id,
          title: o.amendment.title,
          text: o.amendment.text,
          rationale: o.amendment.rationale,
          supporters: [s.id],
          adopted: false,
        };
        amendments.push(a);
        amendmentId = a.id;
        out({ type: "amendment_proposed", runId: id, amendment: a, ts: now() });
      }
      const position: Position = { stakeholderId: s.id, stance: o.stance, argument: o.argument, citedStat: o.citedStat, amendmentId };
      positions.push(position);
      out({ type: "position", runId: id, position, ts: now() });
      out({
        type: "debate_msg",
        runId: id,
        message: { id: shortId("msg"), round: 1, from: s.id, to: "floor", intent: "position", protocol: "policy.position.v1", body: o.argument, cite: o.citedStat, refAmendment: amendmentId },
        ts: now(),
      });
      mkSpan(s, 1, o.latencyMs, o.source, `${o.stance}: ${o.argument}`, o.considered, o.rejected, o.argument, false, `constituents: ${baseById[s.id].label} impact ${baseById[s.id].meanImpact}`);
      phase(s.id, "speaking");
      await sleep(D.step);
    }
    step("positions", "done");

    // Chair frames the central conflict.
    const framing = await chairFraming(chair, brief, positions);
    if (framing) {
      out({ type: "debate_msg", runId: id, message: { id: shortId("msg"), round: 1, from: chair.id, to: "floor", intent: "gavel", protocol: "council.frame.v1", body: framing, cite: `Gini ${brief.giniBefore}→${brief.giniAfter}` }, ts: now() });
      narrate(1, framing, "info");
    }
    await sleep(D.phase);

    // ----- 4) DEBATE: react to the strongest amendment -----------------------
    const opposed = positions.filter((p) => p.stance !== "support");
    const allAligned = opposed.length === 0;

    let lead: Amendment | undefined;
    if (!allAligned) {
      step("debate", "running");
      // The strongest claim: the amendment from the most-harmed constituency.
      const ranked = [...amendments].sort((a, b) => (baseById[a.by]?.meanImpact ?? 0) - (baseById[b.by]?.meanImpact ?? 0));
      lead = ranked[0] ?? chairCompromise(brief, chair);
      if (!amendments.some((a) => a.id === lead!.id)) {
        amendments.push(lead);
        out({ type: "amendment_proposed", runId: id, amendment: lead, ts: now() });
      }
      const proposer = panel.find((s) => s.id === lead!.by) ?? chair;
      const worst = brief.whoGetsHurt[0];
      out({ type: "conflict", runId: id, round: 2, description: `The panel splits over "${model.title}". ${worst ? `${worst.segment} absorb the harm.` : "Distribution is contested."} ${proposer.name} tables "${lead.title}".`, by: chair.id, ts: now() });
      narrate(2, `The fault line: ${worst ? worst.segment.toLowerCase() : "the most exposed residents"} absorb the harm. ${proposer.name} tables ${lead.title}.`, "conflict");

      const others = seats.filter((s) => s.id !== lead!.by);
      for (const s of others) phase(s.id, "reasoning");
      await sleep(D.fan);
      const reactions = await Promise.all(others.map((s) => reactToAmendment(s, lead!, proposer.name, brief, baseById[s.id])));
      for (let i = 0; i < others.length; i++) {
        const s = others[i];
        const r = reactions[i];
        if (r.intent === "support" || r.intent === "concede") lead.supporters.push(s.id);
        const msg: DebateMessage = { id: shortId("msg"), round: 2, from: s.id, to: lead.by, intent: r.intent, protocol: "policy.amend.v1", body: r.message, cite: r.cite, refAmendment: lead.id };
        out({ type: "debate_msg", runId: id, message: msg, ts: now() });
        mkSpan(s, 2, r.latencyMs, r.source, `${r.intent}: ${r.message}`, [], [], r.message, r.intent === "concede", `reacting to ${lead.title}`);
        phase(s.id, "speaking");
        await sleep(D.step);
      }
      step("debate", "done");
    } else {
      step("debate", "skipped");
      narrate(2, `The panel is broadly aligned — the simulated outcome favors the seats at the table.`, "success");
    }

    // ----- 5) AMEND: adopt the lead amendment if it has a coalition -----------
    const adopted: Amendment[] = [];
    if (lead) {
      step("amend", "running");
      // The Chair holds the gavel for fairness: when the simulation shows real
      // harm and the lead amendment is relief for the hardest-hit constituency,
      // the Chair advances it — breaking a deadlock toward the people the bill
      // hurts. (In a benign run with no losers, the Chair stays out and the bill
      // stands as written.)
      const harmExists = brief.whoGetsHurt.length > 0;
      const proposerHurt = (baseById[lead.by]?.meanImpact ?? 0) < 0;
      if (harmExists && proposerHurt && !lead.supporters.includes(chair.id)) {
        lead.supporters.push(chair.id);
        out({
          type: "debate_msg",
          runId: id,
          message: { id: shortId("msg"), round: 3, from: chair.id, to: lead.by, intent: "support", protocol: "council.broker.v1", body: `The chair advances "${lead.title}" to reduce the modeled harm to ${brief.whoGetsHurt[0].segment.toLowerCase()}.`, cite: `${brief.whoGetsHurt[0].segment} impact ${brief.whoGetsHurt[0].impactScore}`, refAmendment: lead.id },
          ts: now(),
        });
      }
      const need = Math.max(2, Math.ceil(seats.length / 2));
      if (new Set(lead.supporters).size >= need) {
        lead.adopted = true;
        adopted.push(lead);
        out({ type: "amendment_adopted", runId: id, amendment: lead, ts: now() });
        narrate(3, `The council adopts "${lead.title}".`, "success");
      } else {
        narrate(3, `"${lead.title}" failed to win a coalition; the bill stands as written.`, "alert");
      }
      step("amend", "done");
    } else {
      step("amend", "skipped");
    }

    // ----- 6) RE-TEST: re-simulate the amended bill on the SAME population -----
    let byStakeholder: StakeholderDelta[] = seats.map((s) => ({ stakeholderId: s.id, label: s.seat, before: baseById[s.id].meanImpact, after: baseById[s.id].meanImpact, delta: 0 }));
    let amendedHeadline = "no amendment was required";
    if (adopted.length) {
      step("retest", "running");
      narrate(4, `Re-running the amended bill on the same ${agentCount} residents.`, "info");
      const amendedPolicy = `${req.policy}\n\nADOPTED AMENDMENTS:\n${adopted.map((a) => `- ${a.title}: ${a.text}`).join("\n")}`;
      const amendedModel = await analyzePolicy(amendedPolicy, req.jurisdiction);
      const after = runOnce(profile, amendedModel, agentCount, seed); // identical profile + seed
      const before = snapshot(base.agents, base.analysis.giniAfter);
      const afterSnap = snapshot(after.agents, after.analysis.giniAfter);
      byStakeholder = seats.map((s) => {
        const a = constituentOutcome(s, after.agents);
        return { stakeholderId: s.id, label: s.seat, before: baseById[s.id].meanImpact, after: a.meanImpact, delta: a.meanImpact - baseById[s.id].meanImpact };
      });
      const hl = impactHeadline(before, afterSnap);
      amendedHeadline = hl.headline;
      out({ type: "amendment_impact", runId: id, impact: { amendedPolicy, adopted, before, after: afterSnap, byStakeholder, headline: amendedHeadline }, ts: now() });
      step("retest", "done");
      narrate(4, `Measured on the twin: ${amendedHeadline}.`, hl.improved ? "success" : "alert");
      await sleep(D.phase);
    } else {
      step("retest", "skipped");
    }

    // ----- 7) VOTE (parallel) ------------------------------------------------
    step("vote", "running");
    for (const s of seats) phase(s.id, "deciding");
    await sleep(D.fan);
    const deltaById: Record<string, StakeholderDelta> = Object.fromEntries(byStakeholder.map((d) => [d.stakeholderId, d]));
    const voteResults = await Promise.all(seats.map((s) => closingVote(s, deltaById[s.id], amendedHeadline, adopted.map((a) => a.title))));
    const votes: CastVote[] = [];
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i];
      const v = voteResults[i];
      const cast: CastVote = { stakeholderId: s.id, vote: v.vote, rationale: v.rationale };
      votes.push(cast);
      out({ type: "vote", runId: id, vote: cast, ts: now() });
      phase(s.id, "done");
      await sleep(D.fan);
    }
    const tally = { aye: votes.filter((v) => v.vote === "aye").length, nay: votes.filter((v) => v.vote === "nay").length, abstain: votes.filter((v) => v.vote === "abstain").length };
    step("vote", "done");

    // ----- 8) RATIFY ---------------------------------------------------------
    step("ratify", "running");
    const outcome: CouncilOutcome =
      tally.aye === 0 ? "failed" : tally.aye > tally.nay ? (adopted.length ? "passed_amended" : "passed") : tally.aye === tally.nay ? "deadlocked" : "failed";

    const nameOf = (sid: string) => panel.find((s) => s.id === sid)?.name ?? sid;
    const trace = spans.map((sp) => ({ round: sp.round, who: nameOf(sp.stakeholderId), said: sp.chosen, conceded: sp.conflict && sp.source !== "deterministic" }));
    const synth = await chairVerdict({
      policyTitle: model.title,
      outcome,
      adopted: adopted.map((a) => ({ title: a.title, by: nameOf(a.by) })),
      beforeAfter: amendedHeadline,
      trace,
    });

    const concedeSpan = spans.find((sp) => sp.round === 2 && sp.conflict);
    const leadProposerId = adopted[0]?.by ?? lead?.by;
    const criticalConcession = {
      round: concedeSpan?.round ?? 3,
      stakeholderId: (concedeSpan?.stakeholderId ?? leadProposerId ?? chair.id) as Stakeholder["id"],
      what: synth?.criticalConcession.what ?? (adopted[0] ? `Adoption of "${adopted[0].title}".` : "The panel held its positions."),
      why: synth?.criticalConcession.why ?? (concedeSpan?.rationale ?? "The decisive move in the hearing."),
      counterfactual: synth?.criticalConcession.counterfactual ?? (adopted[0] ? `Without it, ${brief.whoGetsHurt[0]?.segment.toLowerCase() ?? "the exposed residents"} would have absorbed the unamended harm.` : "The unamended bill would have stood."),
    };

    const verdict: Verdict = {
      outcome,
      headline: synth?.headline ?? defaultVerdictHeadline(outcome, model.title, adopted.length > 0),
      summary: synth?.summary ?? `${tally.aye} in favor, ${tally.nay} opposed${tally.abstain ? `, ${tally.abstain} abstaining` : ""}. ${adopted.length ? `Adopted: ${adopted.map((a) => a.title).join("; ")}. ${amendedHeadline}.` : "No amendment carried."}`,
      tally,
      votes,
      criticalConcession,
    };
    out({ type: "verdict", runId: id, verdict, ts: now() });
    step("ratify", "done");
    narrate(5, `${verdict.headline} (${tally.aye}–${tally.nay}).`, outcome === "deadlocked" || outcome === "failed" ? "conflict" : "success");

    out({ type: "run_complete", runId: id, durationMs: Date.now() - startedAt, ts: now() });
    if (Date.now() - startedAt > WALL_CAP_MS) return;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Council deliberation failed";
    out({ type: "error", runId: id, message, ts: now() });
    out({ type: "run_complete", runId: id, durationMs: Date.now() - startedAt, ts: now() });
  }
}

function chairCompromise(brief: { whoGetsHurt: { segment: string }[] }, chair: Stakeholder): Amendment {
  const worst = brief.whoGetsHurt[0]?.segment ?? "the hardest-hit residents";
  return {
    id: shortId("amd"),
    by: chair.id,
    title: "Chair's compromise: targeted relief",
    text: `Add targeted relief and a phase-in to protect ${worst.toLowerCase()} from the modeled harm.`,
    rationale: `Tabled by the Chair to address the distributional harm to ${worst.toLowerCase()}.`,
    supporters: [chair.id],
    adopted: false,
  };
}

// Lead the spoken payoff with whichever outcome metric the amendment moved
// most — so the headline lands whether the win shows up as less displacement,
// fewer losers, more winners, or a narrower Gini.
function impactHeadline(before: ImpactSnapshot, after: ImpactSnapshot): { headline: string; improved: boolean } {
  const cands = [
    { label: "displacement", b: before.displacementRate, a: after.displacementRate, pct: true, good: "down" as const },
    { label: "residents worse off", b: before.loseShare, a: after.loseShare, pct: true, good: "down" as const },
    { label: "residents better off", b: before.winShare, a: after.winShare, pct: true, good: "up" as const },
    { label: "inequality (Gini)", b: before.giniAfter, a: after.giniAfter, pct: false, good: "down" as const },
  ];
  const top = cands.map((c) => ({ ...c, mag: Math.abs(c.a - c.b) })).sort((x, y) => y.mag - x.mag)[0];
  if (top.mag < (top.pct ? 0.01 : 0.005)) return { headline: "the outcome held steady while shielding the hardest-hit", improved: false };
  const fmt = (n: number) => (top.pct ? fmtPct(n) : n.toFixed(2));
  const improved = top.good === "down" ? top.a < top.b : top.a > top.b;
  return { headline: `${top.label} ${fmt(top.b)} → ${fmt(top.a)}`, improved };
}

function defaultVerdictHeadline(outcome: CouncilOutcome, title: string, amended: boolean): string {
  switch (outcome) {
    case "passed_amended":
      return `"${title}" passes — amended on the floor.`;
    case "passed":
      return `"${title}" passes as written.`;
    case "deadlocked":
      return `"${title}" deadlocks${amended ? " despite an amendment" : ""}.`;
    default:
      return `"${title}" fails to win the council.`;
  }
}
