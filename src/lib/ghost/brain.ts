import { z } from "zod";
import { clamp } from "@/lib/utils";
import type { ActionKind, Advisory, AgentRole, Domain, GhostAgent, NodeKind, WorldNode } from "./types";

// ============================================================================
// Ghost Protocol "brain" — every decision is a real Claude call.
//
// There is no scripted scenario and no templated reasoning. Claude designs the
// world from the prompt + real threat advisories, and the specialist agents
// genuinely choose their own actions each tick. We call the Anthropic Messages
// API directly (the repo's Mastra structured-output path errors in this env),
// then NORMALIZE Claude's free-form vocabulary into the engine's enums (real
// cleanup, not fabrication). Any failure returns null so the caller degrades
// honestly (an agent holds; a run errors) rather than inventing data.
// ============================================================================

const MODEL = process.env.POLICYPULSE_GHOST_MODEL || process.env.POLICYPULSE_ANALYST_MODEL || "anthropic/claude-haiku-4-5";

export function claudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function ghostModelId(): string {
  return MODEL.replace("anthropic/", "");
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callClaude(system: string, user: string, maxTokens: number, timeoutMs = 16000): Promise<{ text: string; latencyMs: number } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ghostModelId(), max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    return { text, latencyMs: Date.now() - t0 };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function claudeJSON<T>(system: string, user: string, schema: z.ZodType<T>, maxTokens: number): Promise<{ data: T; latencyMs: number } | null> {
  const r = await callClaude(system, user, maxTokens);
  if (!r) return null;
  const parsed = schema.safeParse(extractJson(r.text));
  if (!parsed.success) return null;
  return { data: parsed.data, latencyMs: r.latencyMs };
}

// ---------------------------------------------------------------------------
// Normalization — map Claude's free vocabulary onto the engine's enums.
// ---------------------------------------------------------------------------

const AGENT_ROLES: AgentRole[] = ["GridAgent", "SecurityAgent", "CommsAgent", "TrafficAgent", "MedAgent"];

function mapDomain(s: string): Domain {
  const d = s.toLowerCase();
  if (/power|grid|energy|electric/.test(d)) return "power";
  if (/water|waste|reservoir/.test(d)) return "water";
  if (/vehicle|fleet|av|transit|traffic|robotaxi/.test(d)) return "av_fleet";
  if (/hospital|health|clinical|medical/.test(d)) return "hospital";
  return "generic";
}

function mapKind(s: string): NodeKind {
  const k = s.toLowerCase();
  if (/hospital|clinic|icu|care|medical|life.?support|dialysis/.test(k)) return "hospital";
  if (/water|reservoir|treatment|dosing|filtration/.test(k)) return "water";
  if (/data|server|vlan|compute|ehr|imaging/.test(k)) return "datacenter";
  if (/backup|spare|reserve|failover|depot|standby/.test(k)) return "backup";
  if (/control|scada|router|plc|command|intertie|dispatch/.test(k)) return "control";
  if (/transit|zone|fleet|vehicle|corridor|route|lane/.test(k)) return "transit";
  if (/commercial|business|industrial|office/.test(k)) return "commercial";
  if (/resident|sector|neighborhood|home|household|housing/.test(k)) return "residential";
  return "substation";
}

function mapStatus(s: string): "online" | "degraded" | "offline" | "compromised" {
  const v = s.toLowerCase();
  if (/compromis|attack|ransom|infect|breach|hijack|malicious/.test(v)) return "compromised";
  if (/offline|down|dark|failed|dead|out|tripped/.test(v)) return "offline";
  if (/degrad|unstable|partial|risk|warning|strain|overload/.test(v)) return "degraded";
  return "online";
}

export function mapActionKind(s: string): ActionKind {
  const k = s.toLowerCase();
  if (/reroute|redirect|divert|transfer/.test(k)) return "reroute";
  if (/shed/.test(k)) return "shed_load";
  if (/restore|re.?energize|recover|bring.?back|power.?up/.test(k)) return "restore";
  if (/isolat|quarantine|segment|contain|sever|disconnect/.test(k)) return "isolate";
  if (/analy|inspect|investigat|assess|diagnos|fingerprint|scan/.test(k)) return "analyze";
  if (/patch|remediat|\bfix\b|clean|re.?key|neutraliz|eradicat/.test(k)) return "patch";
  if (/protect|guard|defend|shield|safeguard/.test(k)) return "protect";
  if (/broadcast|coordinat|notify|alert|communicat|announce/.test(k)) return "broadcast";
  return "hold";
}

function defaultRoles(domain: Domain): AgentRole[] {
  switch (domain) {
    case "power":
      return ["GridAgent", "SecurityAgent", "CommsAgent"];
    case "water":
      return ["SecurityAgent", "CommsAgent", "MedAgent"];
    case "av_fleet":
      return ["TrafficAgent", "SecurityAgent", "CommsAgent"];
    case "hospital":
      return ["SecurityAgent", "MedAgent", "CommsAgent"];
    default:
      return ["GridAgent", "SecurityAgent", "CommsAgent"];
  }
}

function mapRoles(raw: string[], domain: Domain): AgentRole[] {
  const valid = [...new Set(raw.filter((r): r is AgentRole => (AGENT_ROLES as string[]).includes(r)))];
  return valid.length >= 2 ? valid.slice(0, 5) : defaultRoles(domain);
}

// ---------------------------------------------------------------------------
// Lenient schemas (strings where Claude is free) + typed normalized outputs
// ---------------------------------------------------------------------------

const rawNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.string(),
  status: z.string(),
  critical: z.boolean().optional().default(false),
  populationServed: z.number().optional().default(0),
  capacity: z.number().optional().default(100),
  load: z.number().optional().default(0),
  x: z.number().optional().default(50),
  y: z.number().optional().default(50),
  note: z.string().optional(),
  links: z.array(z.string()).optional().default([]),
});

const rawWorldSchema = z.object({
  title: z.string(),
  domain: z.string().optional().default("generic"),
  threatType: z.string().optional().default("infrastructure crisis"),
  summary: z.string().optional().default(""),
  timeLimitSec: z.number().optional().default(60),
  nodes: z.array(rawNodeSchema).min(4),
  agentRoles: z.array(z.string()).optional().default([]),
});

export interface GeneratedWorld {
  title: string;
  domain: Domain;
  threatType: string;
  summary: string;
  timeLimitSec: number;
  nodes: WorldNode[];
  agentRoles: AgentRole[];
}

const rawActionSchema = z.object({
  kind: z.string(),
  target: z.string().optional(),
  source: z.string().optional(),
  magnitude: z.number().optional(),
  summary: z.string(),
});

const rawDecisionSchema = z.object({
  rationale: z.string(),
  considered: z.array(z.string()).optional().default([]),
  rejected: z.array(z.object({ option: z.string(), why: z.string() })).optional().default([]),
  action: rawActionSchema,
});

export interface ProposedAction {
  kind: ActionKind;
  target?: string;
  source?: string;
  magnitude?: number;
  summary: string;
}
export interface AgentDecision {
  rationale: string;
  considered: string[];
  rejected: { option: string; why: string }[];
  action: ProposedAction;
}

function normalizeAction(a: z.infer<typeof rawActionSchema>): ProposedAction {
  return { kind: mapActionKind(a.kind), target: a.target, source: a.source, magnitude: a.magnitude, summary: a.summary };
}

const reviewSchema = z.object({
  veto: z.boolean(),
  rationale: z.string(),
  message: z.string(),
  cite: z.string().optional(),
});
export type ProposalReview = z.infer<typeof reviewSchema>;

const rawCounterSchema = z.object({
  rationale: z.string(),
  message: z.string(),
  action: rawActionSchema,
});
export interface CounterProposal {
  rationale: string;
  message: string;
  action: ProposedAction;
}

const postMortemSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  criticalDecision: z.object({
    tick: z.number(),
    agentId: z.string(),
    action: z.string(),
    why: z.string(),
    counterfactual: z.string(),
  }),
});
export type SynthesizedPostMortem = z.infer<typeof postMortemSchema>;

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

function advisoryBlock(advisories: Advisory[]): string {
  if (!advisories.length) return "(no live advisories retrieved — design from the prompt alone)";
  return advisories.map((a) => `- [${a.id}] ${a.title}: ${a.detail}${a.url ? ` (${a.url})` : ""}`).join("\n");
}

function worldStateBlock(nodes: WorldNode[]): string {
  return nodes
    .map(
      (n) =>
        `  ${n.id} "${n.label}" kind=${n.kind} status=${n.status}${n.critical ? " CRITICAL" : ""} pop=${n.populationServed} load=${n.load}/${n.capacity} links=[${n.links.join(",")}]`,
    )
    .join("\n");
}

// A real, derived situational summary of the live world (not fabricated data —
// it's a read-out of node statuses) so agents act effectively.
function priorityBlock(nodes: WorldNode[]): string {
  const fmt = (ns: WorldNode[]) => ns.map((n) => `${n.id}(${n.label})`).join(", ") || "none";
  const offline = nodes.filter((n) => n.status === "offline");
  const compromised = nodes.filter((n) => n.status === "compromised");
  const isolated = nodes.filter((n) => n.status === "isolated");
  const critical = nodes.filter((n) => n.critical);
  const sources = nodes
    .filter((n) => !n.critical && (n.status === "online" || n.status === "restored") && n.capacity - n.load > 0)
    .map((n) => `${n.id}(${Math.max(0, n.capacity - n.load)} spare)`);
  return `PRIORITIES (derived from live state):
- OFFLINE (restore these): ${fmt(offline)}
- COMPROMISED (isolate, then patch): ${fmt(compromised)}${isolated.length ? `\n- ISOLATED (patch to neutralize): ${fmt(isolated)}` : ""}
- CRITICAL (protect — do NOT shed/isolate/reroute-from): ${fmt(critical)}
- HEALTHY reroute sources: ${sources.join(", ") || "none"}`;
}

// ---------------------------------------------------------------------------
// 1) World generation — derive the world from prompt + real advisories
// ---------------------------------------------------------------------------

const WORLD_SYSTEM = `You are a crisis-simulation world designer. Given a natural-language crisis prompt and real threat-intelligence advisories, you output a STRUCTURED WORLD GRAPH to simulate — derived entirely from the prompt and advisories.

Rules:
- Reflect every specific the prompt states: which nodes are offline, which is under attack ("compromised"), the population at risk, the time limit.
- Distribute the prompt's stated population across the served nodes so totals are consistent with it.
- Include at least one "compromised" or "offline" node, and at least one node with "critical": true. Mark ONLY genuine life-safety nodes critical (hospital, water, control/life-support) — NEVER a backup or an ordinary substation. Always include at least one HEALTHY, non-critical "backup" node with spare capacity so restoration is possible.
- Keep the number of initially-failed (offline + compromised) nodes small — about 3-4 — so the team can plausibly resolve it within the deadline.
- Prefer these node "kind" values: substation, hospital, residential, commercial, backup, control, water, datacenter, transit. Prefer these "status" values: online, degraded, offline, compromised. Prefer "domain": power, water, av_fleet, hospital. Prefer agentRoles from: GridAgent, SecurityAgent, CommsAgent, TrafficAgent, MedAgent (3-4 of them).
- Lay nodes on a 0-100 plane (x,y) as a connected graph (6-8 nodes; keep it resolvable within the deadline); "links" are node ids.
- "note" fields, when present, must be grounded in the prompt or an advisory — never invented incidents.

Return ONLY a JSON object: {title, domain, threatType, summary, timeLimitSec, nodes:[{id,label,kind,status,critical,populationServed,capacity,load,x,y,note?,links:[]}], agentRoles:[]}.`;

function normalizeWorld(raw: z.infer<typeof rawWorldSchema>): GeneratedWorld {
  const domain = mapDomain(raw.domain);
  const ids = new Set(raw.nodes.map((n) => n.id));
  const nodes: WorldNode[] = raw.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    kind: mapKind(n.kind),
    status: mapStatus(n.status),
    critical: !!n.critical,
    populationServed: Math.max(0, Math.round(n.populationServed)),
    capacity: Math.max(1, Math.round(n.capacity)),
    load: Math.max(0, Math.round(n.load)),
    x: clamp(n.x, 0, 100),
    y: clamp(n.y, 0, 100),
    note: n.note,
    links: (n.links ?? []).filter((l) => ids.has(l) && l !== n.id),
  }));
  // Only true life-safety kinds may be "critical" — a backup or ordinary
  // substation must never be protected, or the team loses its reroute source.
  const CRITICAL_KINDS = new Set<NodeKind>(["hospital", "water", "control"]);
  for (const n of nodes) if (!CRITICAL_KINDS.has(n.kind)) n.critical = false;
  if (!nodes.some((n) => n.critical)) {
    const c = nodes.find((n) => CRITICAL_KINDS.has(n.kind));
    if (c) c.critical = true;
  }
  // Guarantee at least one usable (non-critical, healthy, spare-capacity) source.
  const hasSource = nodes.some((n) => !n.critical && n.capacity > n.load && (n.status === "online" || n.status === "degraded"));
  if (!hasSource) {
    const cand = nodes
      .filter((n) => n.status === "online" || n.status === "degraded")
      .sort((a, b) => b.capacity - b.load - (a.capacity - a.load))[0];
    if (cand) cand.critical = false;
  }
  // Keep the crisis resolvable within the deadline: cap offline nodes at 3,
  // demoting the smallest-impact extras to "degraded" (still serving).
  const offlineNodes = nodes.filter((n) => n.status === "offline").sort((a, b) => a.populationServed - b.populationServed);
  for (const n of offlineNodes.slice(0, Math.max(0, offlineNodes.length - 3))) {
    n.status = "degraded";
    if (n.load === 0) n.load = Math.round(n.capacity * 0.5);
  }

  spreadLayout(nodes);

  return {
    title: raw.title,
    domain,
    threatType: raw.threatType,
    summary: raw.summary,
    timeLimitSec: clamp(Math.round(raw.timeLimitSec), 20, 600),
    nodes,
    agentRoles: mapRoles(raw.agentRoles, domain),
  };
}

// Claude's raw x/y often clusters; relax overlapping nodes apart and fit the
// bounding box to the board so the situation graph is legible and fills space.
function spreadLayout(nodes: WorldNode[]): void {
  if (nodes.length < 2) return;
  const MIN = nodes.length > 8 ? 17 : 23;
  for (let iter = 0; iter < 80; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) {
          dx = i % 2 ? 0.6 : -0.6;
          dy = j % 2 ? 0.6 : -0.6;
          d = Math.hypot(dx, dy);
        }
        if (d < MIN) {
          const push = (MIN - d) / 2;
          dx /= d;
          dy /= d;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
  }
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  for (const n of nodes) {
    n.x = Math.round(10 + ((n.x - minX) / spanX) * 80);
    n.y = Math.round(12 + ((n.y - minY) / spanY) * 76);
  }
}

function validateWorld(w: GeneratedWorld): boolean {
  const hasFailure = w.nodes.some((n) => n.status === "offline" || n.status === "compromised");
  const hasCritical = w.nodes.some((n) => n.critical);
  return hasFailure && hasCritical && w.nodes.length >= 4;
}

export async function generateWorld(prompt: string, advisories: Advisory[]): Promise<{ world: GeneratedWorld; latencyMs: number } | null> {
  const user = `CRISIS PROMPT:\n${prompt}\n\nREAL THREAT ADVISORIES (live research):\n${advisoryBlock(advisories)}\n\nDesign the world now as JSON.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await claudeJSON(WORLD_SYSTEM, user, rawWorldSchema, 4096);
    if (r) {
      const world = normalizeWorld(r.data);
      if (validateWorld(world)) return { world, latencyMs: r.latencyMs };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2) Agent decision — the agent genuinely chooses its action
// ---------------------------------------------------------------------------

function roleSystem(agent: GhostAgent): string {
  const tactics: Record<string, string> = {
    GridAgent: "Restore OFFLINE nodes by rerouting spare capacity from healthy/backup nodes. Don't leave dark sectors unaddressed.",
    TrafficAgent: "Restore OFFLINE zones/corridors by rerouting from healthy/backup capacity. Keep emergency corridors clear.",
    SecurityAgent: "First ISOLATE the compromised node, then PATCH it to neutralize the threat. Never isolate critical infrastructure.",
    MedAgent: "Keep critical/patient-facing nodes served; restore offline care-dependent nodes; flag anything that risks life-safety load.",
    CommsAgent: "Assert PROTECT over critical nodes and broker consensus. You hold veto authority over actions that endanger critical infrastructure.",
  };
  return `You are ${agent.name}, an autonomous specialist agent in a live infrastructure crisis. Mandate: ${agent.blurb}

TEAM OBJECTIVE: bring EVERY node back online and fully neutralize the threat before the deadline. A compromised node is only neutralized once it is isolated AND then patched. Don't act on nodes that are already healthy.

YOUR TACTICS: ${tactics[agent.role] ?? agent.blurb}

Each tick you observe the world and choose ONE action that best advances the objective from your mandate. Be decisive and operational; you are under a hard time budget, not chatting.

Action kinds: reroute (move capacity source->target), shed_load (drop load from a node), restore (bring an offline node back), isolate (quarantine a compromised node), analyze (inspect an intrusion), patch (remediate a compromised/isolated node), protect (assert protection over a node), broadcast (coordinate), hold (no-op).

Rules: ALWAYS reference nodes by their exact id from the world state (e.g. sub_central), never by label. Don't repeat an action a teammate just completed (see recent messages). Pursue your mandate honestly. A restorer uses HEALTHY/BACKUP capacity as the reroute source and only considers a critical node as a last resort when no other source exists. Output JSON: {rationale (1-3 sentences, first person), considered:[..], rejected:[{option,why}], action:{kind,target?,source?,magnitude?,summary}}.`;
}

export async function decideAction(
  agent: GhostAgent,
  nodes: WorldNode[],
  threatType: string,
  recentMessages: string[],
): Promise<{ decision: AgentDecision; latencyMs: number } | null> {
  const user = `THREAT: ${threatType}
WORLD STATE (live):
${worldStateBlock(nodes)}

${priorityBlock(nodes)}
${recentMessages.length ? `\nRECENT AGENT MESSAGES:\n${recentMessages.map((m) => `- ${m}`).join("\n")}` : ""}

Choose your action now as JSON.`;
  const r = await claudeJSON(roleSystem(agent), user, rawDecisionSchema, 900);
  if (!r) return null;
  return {
    decision: { rationale: r.data.rationale, considered: r.data.considered, rejected: r.data.rejected, action: normalizeAction(r.data.action) },
    latencyMs: r.latencyMs,
  };
}

// ---------------------------------------------------------------------------
// 3) Negotiation — guardian reviews an unsafe proposal; proposer counters
// ---------------------------------------------------------------------------

export async function reviewProposal(
  guardian: GhostAgent,
  proposerName: string,
  proposalSummary: string,
  threatenedNode: WorldNode,
  nodes: WorldNode[],
  advisories: Advisory[],
): Promise<{ review: ProposalReview; latencyMs: number } | null> {
  const system = `You are ${guardian.name}. Mandate: ${guardian.blurb} You have authority to VETO actions that endanger critical infrastructure. Decide whether to veto the incoming proposal. If you veto, cite a real advisory id if one applies. Output JSON: {veto:boolean, rationale, message (the structured message you send the proposer), cite?}.`;
  const user = `INCOMING PROPOSAL from ${proposerName}: ${proposalSummary}
This action affects ${threatenedNode.label} (${threatenedNode.id})${threatenedNode.critical ? ", which is CRITICAL infrastructure" : ""}.

WORLD STATE:
${worldStateBlock(nodes)}

REAL ADVISORIES:
${advisoryBlock(advisories)}

Decide now as JSON.`;
  const r = await claudeJSON(system, user, reviewSchema, 600);
  if (!r) return null;
  return { review: r.data, latencyMs: r.latencyMs };
}

export async function counterProposal(
  proposer: GhostAgent,
  vetoMessage: string,
  nodes: WorldNode[],
): Promise<{ counter: CounterProposal; latencyMs: number } | null> {
  const system = `You are ${proposer.name}. Mandate: ${proposer.blurb} Your previous proposal was vetoed on safety grounds. Recalculate an alternative action that achieves your goal WITHOUT the vetoed risk. Output JSON: {rationale, message (your acknowledgement/counter to the team), action:{kind,target?,source?,magnitude?,summary}}.`;
  const user = `VETO RECEIVED: ${vetoMessage}

WORLD STATE:
${worldStateBlock(nodes)}

${priorityBlock(nodes)}

Provide a revised, SAFE action now (use a healthy reroute source, never a critical node) as JSON.`;
  const r = await claudeJSON(system, user, rawCounterSchema, 700);
  if (!r) return null;
  return { counter: { rationale: r.data.rationale, message: r.data.message, action: normalizeAction(r.data.action) }, latencyMs: r.latencyMs };
}

// ---------------------------------------------------------------------------
// 4) Post-mortem synthesis from the REAL trace
// ---------------------------------------------------------------------------

export async function synthesizePostMortem(input: {
  title: string;
  outcome: string;
  trace: { tick: number; agent: string; action: string; rationale: string; conflict: boolean }[];
  conflicts: { tick: number; description: string; by: string }[];
}): Promise<{ data: SynthesizedPostMortem; latencyMs: number } | null> {
  const system = `You are an analyst writing the post-mortem of a multi-agent crisis response. You are given the REAL decision trace. Identify the single most consequential decision and explain it and its counterfactual. Do not invent events not in the trace. Output JSON: {headline, summary, criticalDecision:{tick, agentId, action, why, counterfactual}}.`;
  const traceBlock = input.trace.map((t) => `T${t.tick} ${t.agent}${t.conflict ? " [CONFLICT]" : ""}: ${t.action} — ${t.rationale}`).join("\n");
  const user = `CRISIS: ${input.title}
OUTCOME: ${input.outcome}
CONFLICTS: ${input.conflicts.length ? input.conflicts.map((c) => `T${c.tick}: ${c.description}`).join("; ") : "none"}

DECISION TRACE:
${traceBlock}

Write the post-mortem now as JSON.`;
  const r = await claudeJSON(system, user, postMortemSchema, 900);
  if (!r) return null;
  return { data: r.data, latencyMs: r.latencyMs };
}
