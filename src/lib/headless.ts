import { analyze, computeRoundMetrics } from "./metrics";
import { SimulationEngine } from "./engine";
import { loadProfile } from "./ingest";
import { spawnPersonas } from "./personas";
import { runPolicyAnalysis } from "@/mastra/agents/policy-analyst";
import {
  ROUNDS,
  type AgentRecord,
  type Analysis,
  type Band,
  type Channel,
  type CohortRisk,
  type CompareDiff,
  type CompareResult,
  type CompareSide,
  type DemographicProfile,
  type MetricBands,
  type MonteCarloResult,
  type Outcome,
  type OutcomeShareBand,
  type PolicyDigest,
  type PolicyModel,
  type RoundDef,
  type RoundMetrics,
  type SensitivityResult,
  type SweepParam,
  type SweepPoint,
  type SweepSeries,
  type SweepUnit,
  type TornadoBar,
} from "./types";
import { clamp, makeRng } from "./utils";

// ============================================================================
// Headless simulation runner + analytics.
//
// The live orchestrator paces the engine and streams events for the dashboard.
// These helpers run the *same* engine with no pacing so we can run it hundreds
// of times to build Monte Carlo bands, A/B comparisons, and sensitivity sweeps.
// Ingestion (Census) and policy analysis (the LLM) happen ONCE per request;
// only the cheap engine loop re-runs per draw.
// ============================================================================

const BASELINE_ROUND: RoundDef = { index: -1, label: "Today", monthsElapsed: 0 };
const ALL_OUTCOMES: Outcome[] = ["better", "stable", "worse", "displaced"];

// Stable cohorts (mirrors metrics.buildRoleCohorts + the demographic split) so
// Monte Carlo / Compare risk lines line up with the live inequality spotlight.
const COHORTS: { label: string; pred: (a: AgentRecord) => boolean }[] = [
  { label: "Low-wage renters", pred: (a) => a.persona.lowWage && a.persona.tenure === "renter" },
  { label: "Small landlords", pred: (a) => a.persona.roles.includes("small_landlord") },
  { label: "Small-business owners", pred: (a) => a.persona.roles.includes("business_owner") },
  { label: "Immigrant households", pred: (a) => a.persona.nativity === "immigrant" },
  { label: "Renters", pred: (a) => a.persona.tenure === "renter" },
  { label: "Homeowners", pred: (a) => a.persona.tenure === "owner" },
];

export interface PrepareRequest {
  policy: string;
  jurisdiction: string;
  stateCode?: string;
}

export interface Prepared {
  profile: DemographicProfile;
  model: PolicyModel;
}

/** Ingest the community and analyze the policy once; reuse across many draws. */
export async function prepare(req: PrepareRequest): Promise<Prepared> {
  const { profile } = await loadProfile(req.jurisdiction, req.stateCode);
  const model = await runPolicyAnalysis(req.policy, req.jurisdiction);
  return { profile, model };
}

/** Ingest just the community profile (shared by both sides of a comparison). */
export async function prepareProfile(jurisdiction: string, stateCode?: string): Promise<DemographicProfile> {
  const { profile } = await loadProfile(jurisdiction, stateCode);
  return profile;
}

/** Analyze a policy into a structured model (LLM analyst or heuristic). */
export async function analyzePolicy(policy: string, jurisdiction: string): Promise<PolicyModel> {
  return runPolicyAnalysis(policy, jurisdiction);
}

export interface HeadlessRun {
  metricsByRound: RoundMetrics[]; // baseline (round -1) + each ROUND
  analysis: Analysis;
  agents: AgentRecord[];
  supplyIndex: number;
}

/** One deterministic engine run for a given seed. No pacing, no events. */
export function runOnce(
  profile: DemographicProfile,
  model: PolicyModel,
  agentCount: number,
  seed: string,
): HeadlessRun {
  const rng = makeRng(seed);
  const { personas } = spawnPersonas(profile, agentCount, rng);
  const engine = new SimulationEngine(profile, model, personas, rng);

  const baselineAvgBurden =
    engine.agents.reduce((s, a) => s + a.history[0].state.rentBurden, 0) /
    Math.max(engine.agents.length, 1);

  const metricsByRound: RoundMetrics[] = [
    computeRoundMetrics(engine.agents, profile, BASELINE_ROUND, 100, baselineAvgBurden),
  ];
  for (const round of ROUNDS) {
    const { supplyIndex } = engine.step(round);
    metricsByRound.push(computeRoundMetrics(engine.agents, profile, round, supplyIndex, baselineAvgBurden));
  }

  const agents = engine.finalize();
  const analysis = analyze(agents, profile, model, engine.supplyIndex);
  return { metricsByRound, analysis, agents, supplyIndex: engine.supplyIndex };
}

// ---------------------------------------------------------------------------
// Per-draw extraction + aggregation
// ---------------------------------------------------------------------------

interface CohortDraw {
  count: number;
  meanImpact: number;
  dispRate: number;
  hurtRate: number;
}

interface DrawRecord {
  metricsByRound: RoundMetrics[];
  outcomeShares: Record<Outcome, number>;
  giniBefore: number;
  giniAfter: number;
  loseShare: number;
  winShare: number;
  cohorts: Record<string, CohortDraw>;
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.round(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

function band(xs: number[], digits = 4): Band {
  const sorted = [...xs].sort((a, b) => a - b);
  const r = (v: number) => roundTo(v, digits);
  return {
    mean: r(avg(xs)),
    p10: r(percentile(sorted, 0.1)),
    p90: r(percentile(sorted, 0.9)),
    min: r(sorted[0] ?? 0),
    max: r(sorted[sorted.length - 1] ?? 0),
  };
}

function roundTo(v: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

function cohortDrawStats(agents: AgentRecord[]): Record<string, CohortDraw> {
  const out: Record<string, CohortDraw> = {};
  for (const c of COHORTS) {
    const members = agents.filter(c.pred);
    if (members.length === 0) {
      out[c.label] = { count: 0, meanImpact: 0, dispRate: 0, hurtRate: 0 };
      continue;
    }
    const displaced = members.filter((m) => m.current.displaced || m.current.leftJurisdiction).length;
    const hurt = members.filter((m) => m.impactScore < 0).length;
    out[c.label] = {
      count: members.length,
      meanImpact: avg(members.map((m) => m.impactScore)),
      dispRate: displaced / members.length,
      hurtRate: hurt / members.length,
    };
  }
  return out;
}

function toDrawRecord(run: HeadlessRun): DrawRecord {
  const total = Math.max(run.agents.length, 1);
  const shares: Record<Outcome, number> = { better: 0, stable: 0, worse: 0, displaced: 0 };
  for (const a of run.agents) shares[a.outcome] += 1 / total;
  const loseShare = (shares.worse ?? 0) + (shares.displaced ?? 0);
  const winShare = shares.better ?? 0;
  return {
    metricsByRound: run.metricsByRound,
    outcomeShares: shares,
    giniBefore: run.analysis.giniBefore,
    giniAfter: run.analysis.giniAfter,
    loseShare,
    winShare,
    cohorts: cohortDrawStats(run.agents),
  };
}

/** Run `draws` independent draws; each seed varies population AND behavior. */
function runDraws(
  profile: DemographicProfile,
  model: PolicyModel,
  agentCount: number,
  draws: number,
  seedPrefix: string,
): DrawRecord[] {
  const records: DrawRecord[] = [];
  for (let i = 0; i < draws; i++) {
    records.push(toDrawRecord(runOnce(profile, model, agentCount, `${seedPrefix}:${i}`)));
  }
  return records;
}

function policyDigest(model: PolicyModel): PolicyDigest {
  return {
    title: model.title,
    type: model.type,
    summary: model.summary,
    modelSource: model.modelSource,
    confidence: model.confidence,
  };
}

function aggregateBands(records: DrawRecord[]): MetricBands {
  const roundCount = records[0]?.metricsByRound.length ?? 0;
  const pick = (i: number, sel: (m: RoundMetrics) => number) =>
    records.map((r) => sel(r.metricsByRound[i]));
  const buildSeries = (sel: (m: RoundMetrics) => number, digits: number) =>
    Array.from({ length: roundCount }, (_, i) => {
      const ref = records[0].metricsByRound[i];
      return { round: ref.round, label: ref.label, ...band(pick(i, sel), digits) };
    });
  return {
    avgRentBurden: buildSeries((m) => m.avgRentBurden, 4),
    displacementRate: buildSeries((m) => m.displacementRate, 4),
    avgWellbeing: buildSeries((m) => m.avgWellbeing, 1),
    housingSupplyIndex: buildSeries((m) => m.housingSupplyIndex, 1),
  };
}

function aggregateOutcomes(records: DrawRecord[]): OutcomeShareBand[] {
  return ALL_OUTCOMES.map((o) => {
    const b = band(records.map((r) => r.outcomeShares[o]), 4);
    return { outcome: o, mean: b.mean, p10: b.p10, p90: b.p90 };
  });
}

function aggregateCohorts(records: DrawRecord[]): CohortRisk[] {
  return COHORTS.map((c) => {
    const present = records.map((r) => r.cohorts[c.label]).filter((d) => d && d.count > 0);
    if (present.length === 0) return null;
    const impacts = present.map((d) => d.meanImpact);
    const b = band(impacts, 1);
    return {
      segment: c.label,
      count: roundTo(avg(present.map((d) => d.count)), 1),
      meanImpact: b.mean,
      impactP10: b.p10,
      impactP90: b.p90,
      displacementProb: roundTo(avg(present.map((d) => d.dispRate)), 4),
      hurtProb: roundTo(avg(present.map((d) => d.hurtRate)), 4),
    } satisfies CohortRisk;
  }).filter((c): c is CohortRisk => c !== null);
}

// ---------------------------------------------------------------------------
// Monte Carlo
// ---------------------------------------------------------------------------

export function monteCarlo(
  prepared: Prepared,
  agentCount: number,
  draws: number,
  jurisdiction: string,
  seedPrefix: string,
): MonteCarloResult {
  const { profile, model } = prepared;
  const records = runDraws(profile, model, agentCount, draws, seedPrefix);
  return {
    draws,
    agentCount,
    jurisdiction,
    policy: policyDigest(model),
    bands: aggregateBands(records),
    outcomeShares: aggregateOutcomes(records),
    giniBefore: band(records.map((r) => r.giniBefore), 4),
    giniAfter: band(records.map((r) => r.giniAfter), 4),
    cohorts: aggregateCohorts(records),
  };
}

// ---------------------------------------------------------------------------
// Compare (A/B) — common random numbers: same seed family for both sides so
// each draw shares an identical population and only the policy differs.
// ---------------------------------------------------------------------------

function finalMetrics(records: DrawRecord[]) {
  const lastBurden = avg(records.map((r) => r.metricsByRound[r.metricsByRound.length - 1].avgRentBurden));
  const lastDisp = avg(records.map((r) => r.metricsByRound[r.metricsByRound.length - 1].displacementRate));
  const lastWell = avg(records.map((r) => r.metricsByRound[r.metricsByRound.length - 1].avgWellbeing));
  const lastSupply = avg(records.map((r) => r.metricsByRound[r.metricsByRound.length - 1].housingSupplyIndex));
  return {
    avgRentBurden: roundTo(lastBurden, 4),
    displacementRate: roundTo(lastDisp, 4),
    avgWellbeing: roundTo(lastWell, 1),
    housingSupplyIndex: roundTo(lastSupply, 1),
    giniAfter: roundTo(avg(records.map((r) => r.giniAfter)), 4),
    loseShare: roundTo(avg(records.map((r) => r.loseShare)), 4),
    winShare: roundTo(avg(records.map((r) => r.winShare)), 4),
  };
}

function buildSide(label: string, model: PolicyModel, records: DrawRecord[]): CompareSide {
  return {
    label,
    policy: policyDigest(model),
    final: finalMetrics(records),
    bands: aggregateBands(records),
    outcomeShares: aggregateOutcomes(records),
    cohorts: aggregateCohorts(records),
  };
}

export function nullPolicyModel(jurisdiction: string): PolicyModel {
  const zero: Record<Channel, number> = { income: 0, housing: 0, employment: 0, wealth: 0, stability: 0 };
  return {
    type: "generic",
    title: "Status quo (no policy)",
    summary: `Counterfactual baseline for ${jurisdiction}: the same residents under ordinary market drift, with no policy applied.`,
    mechanism: "No intervention; only baseline income growth and market rent drift.",
    raw: "",
    intensity: 0,
    timeProfile: "gradual",
    channels: zero,
    beneficiaries: [],
    burdened: [],
    unintended: [],
    confidence: 1,
    modelSource: "heuristic",
  };
}

export function compare(
  profile: DemographicProfile,
  modelA: PolicyModel,
  modelB: PolicyModel,
  labelA: string,
  labelB: string,
  agentCount: number,
  draws: number,
  jurisdiction: string,
  seedPrefix: string,
): CompareResult {
  // Same seed family => paired (identical) populations per draw index.
  const recordsA = runDraws(profile, modelA, agentCount, draws, seedPrefix);
  const recordsB = runDraws(profile, modelB, agentCount, draws, seedPrefix);
  const a = buildSide(labelA, modelA, recordsA);
  const b = buildSide(labelB, modelB, recordsB);

  const mkDiff = (
    key: string,
    label: string,
    av: number,
    bv: number,
    fmt: CompareDiff["fmt"],
    lowerIsBetter: boolean,
  ): CompareDiff => {
    const delta = roundTo(bv - av, fmt === "num" ? 1 : 4);
    const eps = fmt === "num" ? 0.5 : 0.005;
    let better: CompareDiff["better"] = "tie";
    if (Math.abs(bv - av) > eps) {
      const bWins = lowerIsBetter ? bv < av : bv > av;
      better = bWins ? "b" : "a";
    }
    return { key, label, a: av, b: bv, delta, better, fmt };
  };

  const diffs: CompareDiff[] = [
    mkDiff("displacementRate", "Displacement rate", a.final.displacementRate, b.final.displacementRate, "pct", true),
    mkDiff("loseShare", "Residents worse off", a.final.loseShare, b.final.loseShare, "pct", true),
    mkDiff("winShare", "Residents better off", a.final.winShare, b.final.winShare, "pct", false),
    mkDiff("avgRentBurden", "Avg rent burden", a.final.avgRentBurden, b.final.avgRentBurden, "pct", true),
    mkDiff("avgWellbeing", "Avg wellbeing", a.final.avgWellbeing, b.final.avgWellbeing, "num", false),
    mkDiff("giniAfter", "Inequality (Gini)", a.final.giniAfter, b.final.giniAfter, "gini", true),
  ];

  const segments = new Set([...a.cohorts.map((c) => c.segment), ...b.cohorts.map((c) => c.segment)]);
  const cohortDiffs = [...segments]
    .map((segment) => {
      const aImpact = a.cohorts.find((c) => c.segment === segment)?.meanImpact ?? 0;
      const bImpact = b.cohorts.find((c) => c.segment === segment)?.meanImpact ?? 0;
      return { segment, aImpact, bImpact, delta: roundTo(bImpact - aImpact, 1) };
    })
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return { draws, agentCount, jurisdiction, a, b, diffs, cohortDiffs };
}

// ---------------------------------------------------------------------------
// Sensitivity sweep + tornado
// ---------------------------------------------------------------------------

function cloneModel(m: PolicyModel): PolicyModel {
  return {
    ...m,
    channels: { ...m.channels },
    beneficiaries: m.beneficiaries.map((x) => ({ ...x })),
    burdened: m.burdened.map((x) => ({ ...x })),
    unintended: m.unintended.map((x) => ({ ...x })),
  };
}

function applyParam(m: PolicyModel, param: SweepParam, value: number): PolicyModel {
  const c = cloneModel(m);
  switch (param) {
    case "intensity":
      c.intensity = clamp(value, 0, 1);
      break;
    case "supplyElasticity":
      c.supplyElasticity = clamp(value, 0, 1);
      break;
    case "rentCapPct":
      c.rentCapPct = value;
      break;
    case "wageTarget":
      c.wageTarget = value;
      break;
    case "marketRentGrowthPct":
      c.marketRentGrowthPct = value;
      break;
  }
  return c;
}

interface ParamSpec {
  param: SweepParam;
  label: string;
  unit: SweepUnit;
  min: number;
  max: number;
  baseline: number;
}

function paramSpecs(model: PolicyModel): { primary: ParamSpec; all: ParamSpec[] } {
  const intensity: ParamSpec = {
    param: "intensity",
    label: "Policy intensity",
    unit: "ratio",
    min: 0.2,
    max: 0.95,
    baseline: model.intensity,
  };
  if (model.type === "rent_control") {
    const cap: ParamSpec = { param: "rentCapPct", label: "Rent-increase cap", unit: "pct", min: 0.01, max: 0.08, baseline: model.rentCapPct ?? 0.03 };
    const market: ParamSpec = { param: "marketRentGrowthPct", label: "Market rent growth", unit: "pct", min: 0.03, max: 0.1, baseline: model.marketRentGrowthPct ?? 0.07 };
    const elast: ParamSpec = { param: "supplyElasticity", label: "Supply elasticity", unit: "ratio", min: 0.2, max: 0.9, baseline: model.supplyElasticity ?? 0.55 };
    return { primary: cap, all: [cap, elast, market, intensity] };
  }
  if (model.type === "min_wage") {
    const wage: ParamSpec = { param: "wageTarget", label: "Minimum wage target", unit: "usd", min: 15, max: 25, baseline: model.wageTarget ?? 20 };
    const elast: ParamSpec = { param: "supplyElasticity", label: "Employer elasticity", unit: "ratio", min: 0.2, max: 0.9, baseline: model.supplyElasticity ?? 0.45 };
    return { primary: wage, all: [wage, elast, intensity] };
  }
  const all: ParamSpec[] = [intensity];
  if (typeof model.supplyElasticity === "number") {
    all.push({ param: "supplyElasticity", label: "Supply elasticity", unit: "ratio", min: 0.2, max: 0.9, baseline: model.supplyElasticity });
  }
  return { primary: intensity, all };
}

interface PointOutcome {
  displacementRate: number;
  loseShare: number;
  giniAfter: number;
  avgWellbeing: number;
}

function outcomeAt(
  profile: DemographicProfile,
  model: PolicyModel,
  param: SweepParam,
  value: number,
  agentCount: number,
  draws: number,
  seedPrefix: string,
): PointOutcome {
  const records = runDraws(profile, applyParam(model, param, value), agentCount, draws, `${seedPrefix}:${param}:${value}`);
  const last = (r: DrawRecord) => r.metricsByRound[r.metricsByRound.length - 1];
  return {
    displacementRate: roundTo(avg(records.map((r) => last(r).displacementRate)), 4),
    loseShare: roundTo(avg(records.map((r) => r.loseShare)), 4),
    giniAfter: roundTo(avg(records.map((r) => r.giniAfter)), 4),
    avgWellbeing: roundTo(avg(records.map((r) => last(r).avgWellbeing)), 1),
  };
}

function linspace(min: number, max: number, n: number): number[] {
  if (n <= 1) return [min];
  const step = (max - min) / (n - 1);
  return Array.from({ length: n }, (_, i) => roundTo(min + step * i, 4));
}

export function sensitivity(
  prepared: Prepared,
  agentCount: number,
  drawsPerPoint: number,
  jurisdiction: string,
  seedPrefix: string,
  requestedParam?: SweepParam,
  points = 7,
): SensitivityResult {
  const { profile, model } = prepared;
  const specs = paramSpecs(model);
  const primarySpec =
    (requestedParam && specs.all.find((s) => s.param === requestedParam)) || specs.primary;

  const values = linspace(primarySpec.min, primarySpec.max, points);
  const sweepPoints: SweepPoint[] = values.map((value) => {
    const o = outcomeAt(profile, model, primarySpec.param, value, agentCount, drawsPerPoint, seedPrefix);
    return { value, ...o };
  });
  const primary: SweepSeries = {
    param: primarySpec.param,
    label: primarySpec.label,
    unit: primarySpec.unit,
    baseline: roundTo(primarySpec.baseline, 4),
    points: sweepPoints,
  };

  const tornado: TornadoBar[] = specs.all
    .map((spec) => {
      const lo = outcomeAt(profile, model, spec.param, spec.min, agentCount, drawsPerPoint, seedPrefix);
      const hi = outcomeAt(profile, model, spec.param, spec.max, agentCount, drawsPerPoint, seedPrefix);
      return {
        param: spec.param,
        label: spec.label,
        unit: spec.unit,
        low: roundTo(spec.min, 4),
        high: roundTo(spec.max, 4),
        outLow: lo.displacementRate,
        outHigh: hi.displacementRate,
        swing: roundTo(Math.abs(hi.displacementRate - lo.displacementRate), 4),
      } satisfies TornadoBar;
    })
    .sort((a, b) => b.swing - a.swing);

  return {
    agentCount,
    drawsPerPoint,
    jurisdiction,
    policy: { title: model.title, type: model.type },
    primary,
    tornado,
  };
}
