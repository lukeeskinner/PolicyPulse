// ============================================================================
// Stakeholder Council — shared type system.
//
// The civic counterpart to Ghost Protocol. Where Ghost drops specialist agents
// into a failing infrastructure world, the Council drops a panel of STAKEHOLDER
// agents around a *bill* whose distributional impact PolicyPulse has already
// simulated. Each stakeholder reads the real, simulated outcome for the people
// it represents, then argues, proposes amendments, concedes, and votes — and
// any amendment the panel adopts is RE-SIMULATED on the identical population so
// the measured before/after delta is shown, not asserted.
//
// This module is the single source of truth shared by the engine, the Claude
// brain, the API routes, and the React chamber.
// ============================================================================

import type { Analysis, Disparity, PolicyType, SegmentImpact } from "@/lib/types";

// ---------------------------------------------------------------------------
// Stakeholders
// ---------------------------------------------------------------------------

export type StakeholderId =
  | "renter_advocate"
  | "landlord_coalition"
  | "small_business"
  | "labor"
  | "budget_office"
  | "homeowner_assoc"
  | "equity_chair";

export interface Stakeholder {
  id: StakeholderId;
  name: string; // org name, e.g. "Tenants Union"
  seat: string; // who they speak for, e.g. "Renters & low-income tenants"
  color: string;
  mandate: string; // one-line objective (becomes the Claude system prompt)
  isChair: boolean; // the Equity Chair brokers + tallies, never votes a seat
}

// ---------------------------------------------------------------------------
// The grounding brief — the real simulated outcome the debate stands on
// ---------------------------------------------------------------------------

/** A single stakeholder's constituents' measured outcome in a run. */
export interface ConstituentOutcome {
  stakeholderId: StakeholderId;
  label: string; // e.g. "Renters"
  count: number; // residents in this constituency
  meanImpact: number; // -100..100 net welfare change
  displacementRate: number; // 0..1
}

export interface GroundingBrief {
  jurisdiction: string;
  populationLabel: string; // e.g. "60 residents · grounded in CA ACS"
  grounded: boolean;
  policyTitle: string;
  policyType: PolicyType;
  headline: string;
  summary: string;
  giniBefore: number;
  giniAfter: number;
  displacementRate: number; // share of all residents displaced/left
  loseShare: number;
  winShare: number;
  whoGetsHurt: SegmentImpact[];
  winners: SegmentImpact[];
  disparities: Disparity[];
  outcomes: ConstituentOutcome[]; // per-stakeholder, drives the bench
}

// ---------------------------------------------------------------------------
// Positions, amendments, debate messages, votes
// ---------------------------------------------------------------------------

export type Stance = "support" | "oppose" | "conditional";

export interface Amendment {
  id: string;
  by: StakeholderId;
  title: string; // short label, e.g. "Phase-in + small-business carve-out"
  text: string; // the clause appended to the bill when adopted
  rationale: string;
  supporters: StakeholderId[]; // who backed it on the floor
  adopted: boolean;
}

export interface Position {
  stakeholderId: StakeholderId;
  stance: Stance;
  argument: string; // first-person floor statement
  citedStat: string; // the real number they anchor to
  amendmentId?: string; // present when stance is conditional/oppose
}

export type DebateIntent =
  | "position" // opening statement
  | "support" // backs an amendment
  | "oppose" // pushes back on an amendment
  | "amend" // tables an amendment
  | "concede" // moves toward the other side
  | "veto" // a red-line objection
  | "gavel" // the Chair frames / rules
  | "consensus"; // agreement reached

export interface DebateMessage {
  id: string;
  round: number;
  from: StakeholderId;
  to: StakeholderId | "floor";
  intent: DebateIntent;
  protocol: string; // e.g. "policy.amend.v1" — Fetch.ai-style structured msg
  body: string;
  cite?: string; // grounding citation (a real stat)
  refAmendment?: string; // amendment id this references
}

export type Vote = "aye" | "nay" | "abstain";

export interface CastVote {
  stakeholderId: StakeholderId;
  vote: Vote;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Arize-style observability: one trace span per stakeholder reasoning call
// ---------------------------------------------------------------------------

export interface CouncilTraceSpan {
  id: string;
  round: number;
  stakeholderId: StakeholderId;
  model: string;
  source: "llm" | "deterministic";
  latencyMs: number;
  context: string; // what the stakeholder saw (their constituents' outcome)
  chosen: string; // stance / message summary
  considered: string[];
  rejected: { option: string; why: string }[];
  rationale: string;
  conflict: boolean;
}

// ---------------------------------------------------------------------------
// The re-test — the centerpiece. Re-simulate the amended bill on the SAME
// population + seed, and measure what the negotiation actually changed.
// ---------------------------------------------------------------------------

export interface ImpactSnapshot {
  displacementRate: number;
  giniAfter: number;
  loseShare: number;
  winShare: number;
}

export interface StakeholderDelta {
  stakeholderId: StakeholderId;
  label: string;
  before: number; // mean impact
  after: number;
  delta: number;
}

export interface AmendmentImpact {
  amendedPolicy: string; // original + adopted clauses
  adopted: Amendment[];
  before: ImpactSnapshot;
  after: ImpactSnapshot;
  byStakeholder: StakeholderDelta[];
  headline: string; // the spoken payoff, e.g. "displacement 18% → 11%"
}

// ---------------------------------------------------------------------------
// Verdict + post-mortem (the research hook)
// ---------------------------------------------------------------------------

export type CouncilOutcome = "passed" | "passed_amended" | "deadlocked" | "failed";

export interface Verdict {
  outcome: CouncilOutcome;
  headline: string;
  summary: string;
  tally: { aye: number; nay: number; abstain: number };
  votes: CastVote[];
  criticalConcession: {
    round: number;
    stakeholderId: StakeholderId;
    what: string;
    why: string;
    counterfactual: string;
  };
}

// ---------------------------------------------------------------------------
// Narration (Deepgram Aura, reused from Ghost)
// ---------------------------------------------------------------------------

export type CouncilTone = "info" | "alert" | "success" | "conflict";

export interface CouncilNarration {
  id: string;
  round: number;
  text: string;
  tone: CouncilTone;
}

// ---------------------------------------------------------------------------
// Orkes-style orchestration: the deliberation workflow
// ---------------------------------------------------------------------------

export type CouncilStepId =
  | "ground"
  | "convene"
  | "positions"
  | "debate"
  | "amend"
  | "retest"
  | "vote"
  | "ratify";

export type StepStatus = "pending" | "running" | "done" | "skipped";

export interface CouncilStep {
  id: CouncilStepId;
  label: string;
}

export const COUNCIL_WORKFLOW: CouncilStep[] = [
  { id: "ground", label: "Simulate the bill" },
  { id: "convene", label: "Seat the council" },
  { id: "positions", label: "Opening positions" },
  { id: "debate", label: "Debate the floor" },
  { id: "amend", label: "Adopt amendments" },
  { id: "retest", label: "Re-test on the twin" },
  { id: "vote", label: "Call the vote" },
  { id: "ratify", label: "Ratify verdict" },
];

// ---------------------------------------------------------------------------
// Integration status (reused shape from Ghost so the sponsor rail is identical)
// ---------------------------------------------------------------------------

export interface CouncilIntegrationStatus {
  anthropic: boolean;
  deepgram: boolean;
  redis: boolean;
  census: boolean; // population grounded in live ACS
  fetchai: "live" | "native";
  orkes: "live" | "native";
  arize: "live" | "native";
}

// ---------------------------------------------------------------------------
// Stakeholder runtime phase (drives the bench)
// ---------------------------------------------------------------------------

export type StakeholderPhase =
  | "idle"
  | "reviewing" // reading the brief
  | "reasoning"
  | "speaking" // delivering a statement
  | "deciding" // casting a vote
  | "done";

// ---------------------------------------------------------------------------
// Run metadata, events, snapshots
// ---------------------------------------------------------------------------

export interface CouncilRequest {
  policy: string;
  jurisdiction: string;
  stateCode?: string;
  agentCount?: number;
  voice?: boolean;
}

export type CouncilStatus = "running" | "complete" | "error";

export interface CouncilRunMeta {
  runId: string;
  policy: string;
  jurisdiction: string;
  title: string;
  createdAt: number;
  status: CouncilStatus;
  outcome?: CouncilOutcome;
}

export type CouncilEvent =
  | { type: "run_started"; runId: string; meta: CouncilRunMeta; integrations: CouncilIntegrationStatus; ts: number }
  | { type: "step"; runId: string; step: CouncilStepId; status: StepStatus; ts: number }
  | { type: "grounding_ready"; runId: string; brief: GroundingBrief; ts: number }
  | { type: "council_convened"; runId: string; stakeholders: Stakeholder[]; ts: number }
  | { type: "stakeholder_phase"; runId: string; stakeholderId: StakeholderId; phase: StakeholderPhase; thought?: string; ts: number }
  | { type: "position"; runId: string; position: Position; ts: number }
  | { type: "debate_msg"; runId: string; message: DebateMessage; ts: number }
  | { type: "amendment_proposed"; runId: string; amendment: Amendment; ts: number }
  | { type: "amendment_adopted"; runId: string; amendment: Amendment; ts: number }
  | { type: "conflict"; runId: string; round: number; description: string; by: StakeholderId; ts: number }
  | { type: "trace_span"; runId: string; span: CouncilTraceSpan; ts: number }
  | { type: "amendment_impact"; runId: string; impact: AmendmentImpact; ts: number }
  | { type: "vote"; runId: string; vote: CastVote; ts: number }
  | { type: "verdict"; runId: string; verdict: Verdict; ts: number }
  | { type: "narration"; runId: string; narration: CouncilNarration; ts: number }
  | { type: "run_complete"; runId: string; durationMs: number; ts: number }
  | { type: "error"; runId: string; message: string; ts: number };

export interface CouncilSnapshot {
  meta: CouncilRunMeta;
  integrations?: CouncilIntegrationStatus;
  brief?: GroundingBrief;
  stakeholders: Stakeholder[];
  positions: Position[];
  messages: DebateMessage[];
  amendments: Amendment[];
  spans: CouncilTraceSpan[];
  narrations: CouncilNarration[];
  impact?: AmendmentImpact;
  votes: CastVote[];
  verdict?: Verdict;
  events: CouncilEvent[];
}

// Re-export the source analysis shape so the engine seam is explicit.
export type { Analysis };
