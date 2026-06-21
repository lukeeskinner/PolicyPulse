// ============================================================================
// PolicyPulse shared type system
// Single source of truth shared by the simulation engine, Mastra agents,
// the API routes, and the React dashboard.
// ============================================================================

export type Tenure = "renter" | "owner";

export type PolicyType =
  | "rent_control"
  | "min_wage"
  | "zoning"
  | "tax"
  | "healthcare"
  | "immigration"
  | "generic";

export type Channel =
  | "income"
  | "housing"
  | "employment"
  | "wealth"
  | "stability";

export type Role =
  | "worker"
  | "renter"
  | "owner"
  | "small_landlord"
  | "business_owner"
  | "retiree"
  | "student";

// ---------------------------------------------------------------------------
// Grounded demographic data (Census / ACS / BLS shaped)
// ---------------------------------------------------------------------------

export interface SourceRef {
  label: string;
  detail: string;
  url?: string;
  kind:
    | "census"
    | "acs"
    | "bls"
    | "housing"
    | "news"
    | "minutes"
    | "market"
    | "study";
}

export interface Neighborhood {
  name: string;
  share: number; // share of population (0..1)
  medianRent: number; // monthly, typical unit
  gentrification: number; // 0..1 displacement pressure
  incomeIndex: number; // relative to city median (1.0 = median)
}

export interface IncomeBracket {
  label: string;
  share: number;
  min: number;
  max: number;
}

export interface SectorShare {
  label: string;
  share: number; // share of workforce
  lowWageShare: number; // fraction of this sector in low-wage roles
}

export interface GroupStats {
  share: number; // population share (0..1)
  medianIncome: number; // grounded income disparity
  renterShare: number; // tenure disparity
  immigrantShare: number; // 0..1
}

export interface DemographicProfile {
  jurisdiction: string;
  state: string;
  population: number;
  households: number;
  medianIncome: number;
  medianRent: number;
  renterShare: number;
  groups: Record<string, GroupStats>;
  neighborhoods: Neighborhood[];
  incomeBrackets: IncomeBracket[];
  sectors: SectorShare[];
  sources: SourceRef[];
  grounded: boolean; // true when from dataset/Browserbase, false when synthesized
  notes?: string;
}

// ---------------------------------------------------------------------------
// Policy impact model (produced by the PolicyAnalyst agent or heuristic parser)
// ---------------------------------------------------------------------------

export interface ImpactGroupWeight {
  key: string; // a Role or a demographic group label
  weight: number; // -1..1 (positive = benefits, used contextually)
}

export interface UnintendedConsequence {
  flag: string;
  statement: string;
  magnitude: number; // 0..1
  channel: Channel;
}

export interface PolicyModel {
  type: PolicyType;
  title: string;
  summary: string;
  mechanism: string;
  raw: string;
  intensity: number; // 0..1 overall strength of the policy
  rentCapPct?: number; // allowed annual rent increase (rent_control)
  marketRentGrowthPct?: number; // counterfactual market rent growth
  wageTarget?: number; // new hourly minimum (min_wage)
  supplyElasticity?: number; // 0..1 how strongly supply reacts
  timeProfile: "frontloaded" | "gradual" | "delayed";
  channels: Record<Channel, number>; // -1..1 net direction per channel
  beneficiaries: ImpactGroupWeight[];
  burdened: ImpactGroupWeight[];
  unintended: UnintendedConsequence[];
  confidence: number; // 0..1
  modelSource: "llm" | "heuristic";
}

// ---------------------------------------------------------------------------
// Agents (synthetic residents)
// ---------------------------------------------------------------------------

export interface Persona {
  id: string;
  name: string;
  group: string;
  nativity: "native" | "immigrant";
  age: number;
  householdSize: number;
  tenure: Tenure;
  neighborhood: string;
  sector: string;
  roles: Role[];
  incomeBracket: string;
  income: number; // annual household income
  monthlyHousingCost: number;
  savings: number;
  colorKey: string;
  lowWage: boolean;
}

export interface AgentState {
  round: number;
  income: number; // annual
  monthlyHousingCost: number;
  rentBurden: number; // (monthlyHousingCost * 12) / income
  employed: boolean;
  hours: number; // 0..1 of full-time
  displaced: boolean;
  leftJurisdiction: boolean;
  wealth: number;
  wellbeing: number; // 0..100
  status: string;
  flags: string[];
}

export interface AgentHistoryEntry {
  round: number;
  label: string;
  state: AgentState;
  decision: string;
  note: string;
}

export type Outcome = "better" | "stable" | "worse" | "displaced";

export interface AgentRecord {
  persona: Persona;
  history: AgentHistoryEntry[];
  current: AgentState;
  outcome: Outcome;
  impactScore: number; // -100..100 net welfare change
}

// Trimmed agent shape that is safe to stream to the browser.
export interface PublicAgent {
  id: string;
  name: string;
  group: string;
  neighborhood: string;
  tenure: Tenure;
  roles: Role[];
  incomeBracket: string;
  income: number;
  colorKey: string;
  nativity: "native" | "immigrant";
  householdSize: number;
  lowWage: boolean;
}

// ---------------------------------------------------------------------------
// Metrics & inequality analysis
// ---------------------------------------------------------------------------

export interface GroupMetric {
  group: string;
  avgRentBurden: number;
  displacementRate: number;
  employmentRate: number;
  avgWellbeing: number;
  avgIncome: number;
  impactScore: number;
  count: number;
}

export interface RoundMetrics {
  round: number;
  label: string;
  avgRentBurden: number;
  displacementRate: number;
  employmentRate: number;
  avgWellbeing: number;
  housingSupplyIndex: number; // base 100 at start
  affordabilityIndex: number; // base 100 at start
  byGroup: GroupMetric[];
}

export interface Disparity {
  statement: string;
  metric: string;
  advantaged: string;
  disadvantaged: string;
  ratio: number;
}

export interface SegmentImpact {
  segment: string;
  impactScore: number;
  displacementRate: number;
  count: number;
  story: string;
  sampleAgentId?: string;
}

export interface Analysis {
  headline: string;
  summary: string;
  giniBefore: number;
  giniAfter: number;
  disparities: Disparity[];
  unintended: UnintendedConsequence[];
  whoGetsHurt: SegmentImpact[];
  winners: SegmentImpact[];
  // Per-group metrics computed AFTER finalize, so impactScore is populated
  // (the per-round metrics are computed mid-run before finalize sets it).
  byGroup: GroupMetric[];
}

// ---------------------------------------------------------------------------
// Simulation rounds
// ---------------------------------------------------------------------------

export interface RoundDef {
  index: number;
  label: string;
  monthsElapsed: number;
}

export const ROUNDS: RoundDef[] = [
  { index: 0, label: "Month 1", monthsElapsed: 1 },
  { index: 1, label: "Month 6", monthsElapsed: 6 },
  { index: 2, label: "Year 1", monthsElapsed: 12 },
  { index: 3, label: "Year 3", monthsElapsed: 36 },
];

// ---------------------------------------------------------------------------
// Run metadata, events, snapshots
// ---------------------------------------------------------------------------

export interface SimRequest {
  policy: string;
  jurisdiction: string;
  agentCount: number;
  stateCode?: string; // when set, grounds the population in live ACS for that state
}

export type RunStatus = "running" | "complete" | "error";

export interface RunMeta {
  runId: string;
  policy: string;
  jurisdiction: string;
  agentCount: number;
  createdAt: number;
  status: RunStatus;
  headline?: string;
}

export interface CascadeRecord {
  round: number;
  kind: string;
  description: string;
  fromId?: string;
  toIds?: string[];
}

export type SimEvent =
  | { type: "run_started"; runId: string; meta: RunMeta; policyModel: PolicyModel; rounds: RoundDef[]; ts: number }
  | { type: "ingest_source"; runId: string; source: SourceRef; ts: number }
  | { type: "ingest_complete"; runId: string; profile: DemographicProfile; ts: number }
  | { type: "agent_spawned"; runId: string; agent: PublicAgent; index: number; total: number; ts: number }
  | { type: "spawn_complete"; runId: string; total: number; breakdown: Record<string, number>; ts: number }
  | { type: "round_started"; runId: string; round: RoundDef; ts: number }
  | { type: "agent_update"; runId: string; agentId: string; round: number; state: AgentState; decision: string; note: string; ts: number }
  | { type: "cascade"; runId: string; cascade: CascadeRecord; ts: number }
  | { type: "metrics"; runId: string; metrics: RoundMetrics; ts: number }
  | { type: "round_complete"; runId: string; round: number; ts: number }
  | { type: "analysis"; runId: string; analysis: Analysis; ts: number }
  | { type: "run_complete"; runId: string; durationMs: number; ts: number }
  | { type: "error"; runId: string; message: string; ts: number };

export interface RunSnapshot {
  meta: RunMeta;
  policyModel?: PolicyModel;
  profile?: DemographicProfile;
  publicAgents: PublicAgent[];
  agents: AgentRecord[];
  metricsByRound: RoundMetrics[];
  cascades: CascadeRecord[];
  analysis?: Analysis;
  events: SimEvent[];
}

// ---------------------------------------------------------------------------
// Analytics: Monte Carlo bands, scenario comparison, sensitivity sweeps.
// A single deterministic run shows one stochastic draw; these aggregate many
// draws so the dashboard can show distributions instead of point estimates.
// ---------------------------------------------------------------------------

/** Summary statistics for one quantity across many Monte Carlo draws. */
export interface Band {
  mean: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
}

export interface MetricBand extends Band {
  round: number;
  label: string;
}

export interface OutcomeShareBand {
  outcome: Outcome;
  mean: number;
  p10: number;
  p90: number;
}

/** Per-cohort risk aggregated across draws (stable role/tenure cohorts). */
export interface CohortRisk {
  segment: string;
  count: number; // mean cohort size across draws
  meanImpact: number;
  impactP10: number;
  impactP90: number;
  displacementProb: number; // mean share displaced or who left
  hurtProb: number; // mean share with a net welfare loss
}

export interface PolicyDigest {
  title: string;
  type: PolicyType;
  summary: string;
  modelSource: "llm" | "heuristic";
  confidence: number;
}

export interface MetricBands {
  avgRentBurden: MetricBand[];
  displacementRate: MetricBand[];
  avgWellbeing: MetricBand[];
  housingSupplyIndex: MetricBand[];
}

export interface MonteCarloResult {
  draws: number;
  agentCount: number;
  jurisdiction: string;
  policy: PolicyDigest;
  bands: MetricBands;
  outcomeShares: OutcomeShareBand[];
  giniBefore: Band;
  giniAfter: Band;
  cohorts: CohortRisk[];
  representativeRunId?: string; // a single persisted draw, for drill-down
}

export interface CompareFinalMetrics {
  avgRentBurden: number;
  displacementRate: number;
  avgWellbeing: number;
  housingSupplyIndex: number;
  giniAfter: number;
  loseShare: number;
  winShare: number;
}

export interface CompareSide {
  label: string;
  policy: PolicyDigest;
  final: CompareFinalMetrics;
  bands: MetricBands;
  outcomeShares: OutcomeShareBand[];
  cohorts: CohortRisk[];
}

export interface CompareDiff {
  key: string;
  label: string;
  a: number;
  b: number;
  delta: number; // b - a
  better: "a" | "b" | "tie";
  fmt: "pct" | "num" | "gini";
}

export interface CompareResult {
  draws: number;
  agentCount: number;
  jurisdiction: string;
  a: CompareSide;
  b: CompareSide;
  diffs: CompareDiff[];
  cohortDiffs: { segment: string; aImpact: number; bImpact: number; delta: number }[];
}

export type SweepParam =
  | "intensity"
  | "supplyElasticity"
  | "rentCapPct"
  | "wageTarget"
  | "marketRentGrowthPct";

export type SweepUnit = "pct" | "usd" | "ratio";

export interface SweepPoint {
  value: number;
  displacementRate: number;
  loseShare: number;
  giniAfter: number;
  avgWellbeing: number;
}

export interface SweepSeries {
  param: SweepParam;
  label: string;
  unit: SweepUnit;
  baseline: number;
  points: SweepPoint[];
}

export interface TornadoBar {
  param: SweepParam;
  label: string;
  unit: SweepUnit;
  low: number;
  high: number;
  outLow: number;
  outHigh: number;
  swing: number;
}

export interface SensitivityResult {
  agentCount: number;
  drawsPerPoint: number;
  jurisdiction: string;
  policy: { title: string; type: PolicyType };
  primary: SweepSeries;
  tornado: TornadoBar[];
}
