// ============================================================================
// Ghost Protocol — shared type system.
//
// A living crisis simulation: a structured world (a graph of failing nodes)
// breaks, a team of specialist AI agents is deployed into it, and they observe,
// reason, negotiate, and resolve the crisis in real time. This module is the
// single source of truth shared by the engine, the Mastra agents, the API
// routes, and the React dashboard.
// ============================================================================

// ---------------------------------------------------------------------------
// World state — a graph of infrastructure nodes
// ---------------------------------------------------------------------------

export type NodeKind =
  | "substation"
  | "hospital"
  | "residential"
  | "commercial"
  | "backup"
  | "control"
  | "water"
  | "datacenter"
  | "transit";

export type NodeStatus =
  | "online" // healthy, serving load
  | "degraded" // partial / unstable
  | "offline" // down (the crisis)
  | "compromised" // under active attack
  | "isolated" // quarantined from the network
  | "restored"; // brought back by an agent action

export interface WorldNode {
  id: string; // "node-3"
  label: string; // "Sector 3"
  kind: NodeKind;
  status: NodeStatus;
  critical: boolean; // protected infrastructure (hospital, water, control)
  load: number; // current served load (MW or normalized units)
  capacity: number; // max capacity
  populationServed: number;
  x: number; // layout position, 0..100
  y: number; // layout position, 0..100
  note?: string; // grounding annotation (e.g. incident report reference)
  links: string[]; // connected node ids
}

export interface WorldMetrics {
  tick: number;
  secondsRemaining: number;
  populationOnline: number; // people currently with service
  populationAtRisk: number; // people who lose service if nothing changes
  nodesOnline: number;
  nodesOffline: number;
  nodesCompromised: number;
  gridStability: number; // 0..100
  threatContainment: number; // 0..100
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export type AgentRole =
  | "GridAgent"
  | "SecurityAgent"
  | "CommsAgent"
  | "TrafficAgent"
  | "MedAgent";

export type AgentPhase =
  | "idle"
  | "observing"
  | "reasoning"
  | "proposing"
  | "negotiating"
  | "acting"
  | "resolved";

export interface GhostAgent {
  id: string; // "grid"
  role: AgentRole;
  name: string; // "GridAgent"
  color: string;
  blurb: string; // one-line mandate
}

export type ActionKind =
  | "reroute" // move load from one corridor to another
  | "shed_load" // drop load from a sector
  | "restore" // bring a node back online
  | "isolate" // quarantine a compromised node
  | "analyze" // inspect an intrusion signature
  | "patch" // apply a remediation (Cognition stretch)
  | "protect" // assert protection over critical infra
  | "broadcast" // coordination message
  | "hold"; // take no action this tick

export interface AgentAction {
  id: string;
  agentId: string;
  tick: number;
  kind: ActionKind;
  target?: string; // node id
  source?: string; // node id (reroute / shed origin)
  magnitudeMW?: number;
  summary: string; // human one-liner
}

// ---------------------------------------------------------------------------
// Fetch.ai-style structured inter-agent negotiation
// ---------------------------------------------------------------------------

export type NegIntent =
  | "propose"
  | "veto"
  | "counter"
  | "ack"
  | "consensus"
  | "broadcast";

export interface NegMessage {
  id: string;
  tick: number;
  from: string; // agentId
  to: string; // agentId | "all"
  intent: NegIntent;
  protocol: string; // e.g. "grid.reroute.v1"
  refAction?: string; // action this message references
  body: string; // structured-ish content
  cite?: string; // grounding citation (e.g. incident report id)
}

// ---------------------------------------------------------------------------
// Arize-style observability: one trace span per agent reasoning call
// ---------------------------------------------------------------------------

export interface RejectedOption {
  option: string;
  why: string;
}

export interface TraceSpan {
  id: string;
  tick: number;
  agentId: string;
  role: AgentRole;
  model: string; // "claude-haiku-4-5" | "deterministic-policy"
  source: "llm" | "deterministic";
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  worldHash: string; // fingerprint of the world the agent observed
  context: string; // what the agent saw (summary)
  chosen: string; // chosen action summary
  considered: string[]; // alternatives weighed
  rejected: RejectedOption[];
  rationale: string; // reasoning prose
  conflict: boolean; // did this decision trigger / resolve a conflict
}

// ---------------------------------------------------------------------------
// Orkes-style orchestration: the per-tick workflow
// ---------------------------------------------------------------------------

export type WorkflowStepId =
  | "snapshot"
  | "fan_out"
  | "collect"
  | "detect_conflict"
  | "negotiate"
  | "resolve"
  | "apply"
  | "narrate"
  | "advance";

export type StepStatus = "pending" | "running" | "done" | "skipped";

export interface WorkflowStep {
  id: WorkflowStepId;
  label: string;
}

export const TICK_WORKFLOW: WorkflowStep[] = [
  { id: "snapshot", label: "Snapshot world" },
  { id: "fan_out", label: "Fan out to agents" },
  { id: "collect", label: "Collect proposals" },
  { id: "detect_conflict", label: "Detect conflicts" },
  { id: "negotiate", label: "Negotiate" },
  { id: "resolve", label: "Resolve" },
  { id: "apply", label: "Apply to world" },
  { id: "narrate", label: "Narrate" },
  { id: "advance", label: "Advance tick" },
];

// ---------------------------------------------------------------------------
// Narration (Deepgram Aura)
// ---------------------------------------------------------------------------

export type NarrationTone = "info" | "alert" | "success" | "conflict";

export interface Narration {
  id: string;
  tick: number;
  text: string;
  tone: NarrationTone;
}

// ---------------------------------------------------------------------------
// Scenario + grounding
// ---------------------------------------------------------------------------

export type Domain = "power" | "water" | "av_fleet" | "hospital" | "generic";

export interface Advisory {
  id: string; // e.g. "CISA-LIVE-1"
  title: string;
  detail: string;
  url?: string;
}

export interface Grounding {
  source: "browserbase" | "none";
  advisories: Advisory[];
  notes: string;
}

export interface Scenario {
  id: string;
  title: string;
  domain: Domain;
  prompt: string; // the natural-language input that produced it
  summary: string;
  threatType: string; // "earthquake + ransomware", "supply poisoning", ...
  timeLimitSec: number;
  nodes: WorldNode[];
  agentRoles: AgentRole[];
  grounding: Grounding;
  source: "llm"; // always Claude-generated from the prompt + grounding
}

// ---------------------------------------------------------------------------
// Outcome + post-mortem (the research hook)
// ---------------------------------------------------------------------------

export type GhostOutcome = "stabilized" | "failed" | "partial";

export interface PostMortem {
  outcome: GhostOutcome;
  headline: string;
  summary: string;
  criticalDecision: {
    tick: number;
    agentId: string;
    action: string;
    why: string;
    counterfactual: string; // what would have happened otherwise
  };
  timeline: { tick: number; label: string; tone: NarrationTone }[];
  conflictsResolved: number;
  consensusLatencyMs: number;
  agentTraces: Record<string, TraceSpan[]>; // spans keyed by agentId
  metrics: WorldMetrics;
}

// ---------------------------------------------------------------------------
// Integration status (which sponsor surfaces are live vs. native fallback)
// ---------------------------------------------------------------------------

export interface IntegrationStatus {
  anthropic: boolean; // live Claude reasoning (else deterministic policy)
  deepgram: boolean; // live Aura TTS (else browser speech / text)
  redis: boolean; // connected world-state mirror
  browserbase: boolean; // live grounding crawl (else seeded threat intel)
  fetchai: "live" | "native"; // inter-agent negotiation substrate
  orkes: "live" | "native"; // tick orchestration
  arize: "live" | "native"; // trace capture
  simular: "gui" | "json"; // computer-use vs. structured-action mode
  cognition: boolean; // autonomous patch generation enabled
}

// ---------------------------------------------------------------------------
// Run metadata, events, snapshots
// ---------------------------------------------------------------------------

export interface GhostRequest {
  prompt: string;
  scenarioId?: string;
  voice?: boolean;
}

export type GhostStatus = "running" | "complete" | "error";

export interface GhostRunMeta {
  runId: string;
  prompt: string;
  scenarioId: string;
  title: string;
  createdAt: number;
  status: GhostStatus;
  outcome?: GhostOutcome;
}

export type GhostEvent =
  | { type: "run_started"; runId: string; meta: GhostRunMeta; integrations: IntegrationStatus; ts: number }
  | { type: "scenario_parsed"; runId: string; scenario: Scenario; ts: number }
  | { type: "grounding"; runId: string; grounding: Grounding; ts: number }
  | { type: "orkes_workflow"; runId: string; workflowId: string; url: string; ts: number }
  | { type: "world_init"; runId: string; nodes: WorldNode[]; metrics: WorldMetrics; ts: number }
  | { type: "agents_deployed"; runId: string; agents: GhostAgent[]; ts: number }
  | { type: "tick_started"; runId: string; tick: number; secondsRemaining: number; ts: number }
  | { type: "workflow_step"; runId: string; tick: number; step: WorkflowStepId; status: StepStatus; ts: number }
  | { type: "agent_phase"; runId: string; agentId: string; phase: AgentPhase; thought?: string; ts: number }
  | { type: "agent_action"; runId: string; action: AgentAction; ts: number }
  | { type: "neg_message"; runId: string; message: NegMessage; ts: number }
  | { type: "conflict"; runId: string; tick: number; description: string; vetoedAction: string; by: string; ts: number }
  | { type: "consensus"; runId: string; tick: number; summary: string; latencyMs: number; ts: number }
  | { type: "trace_span"; runId: string; span: TraceSpan; ts: number }
  | { type: "world_update"; runId: string; nodes: WorldNode[]; metrics: WorldMetrics; ts: number }
  | { type: "narration"; runId: string; narration: Narration; ts: number }
  | { type: "patch"; runId: string; target: string; summary: string; ts: number }
  | { type: "resolved"; runId: string; outcome: GhostOutcome; metrics: WorldMetrics; ts: number }
  | { type: "postmortem"; runId: string; postMortem: PostMortem; ts: number }
  | { type: "run_complete"; runId: string; durationMs: number; ts: number }
  | { type: "error"; runId: string; message: string; ts: number };

export interface GhostSnapshot {
  meta: GhostRunMeta;
  integrations?: IntegrationStatus;
  orkes?: { workflowId: string; url: string };
  scenario?: Scenario;
  agents: GhostAgent[];
  nodes: WorldNode[];
  metrics?: WorldMetrics;
  narrations: Narration[];
  messages: NegMessage[];
  spans: TraceSpan[];
  postMortem?: PostMortem;
  events: GhostEvent[];
}
