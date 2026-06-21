// ============================================================================
// Historical validation cases.
//
// Each case pairs a real, studied policy with the directional findings of a
// published study. PolicyPulse runs the same policy through its engine so the
// predicted direction can be compared against the documented real-world result.
// Actual figures are summarized from the cited studies and are approximate;
// they are reference points for directional validation, not exact targets.
// ============================================================================

export type PredictedKey =
  | "supplyChangePct" // change in rental supply index vs baseline (%)
  | "rentersBetterOffPct" // share of renters with positive welfare impact
  | "displacementRate" // share of residents displaced or who left
  | "lowWageHoursLossPct" // share of low-wage workers who lost hours
  | "avgRentBurdenDeltaPct"; // change in avg rent burden (percentage points)

export interface ActualMetric {
  key: PredictedKey;
  label: string;
  actual: string; // human-readable documented finding
  direction: "up" | "down" | "mixed"; // documented direction of the effect
}

export interface HistoricalCase {
  id: string;
  title: string;
  jurisdiction: string;
  year: string;
  policy: string;
  agentCount: number;
  source: string;
  sourceUrl: string;
  summary: string;
  actuals: ActualMetric[];
}

export const HISTORICAL_CASES: HistoricalCase[] = [
  {
    id: "sf-rent-control-1994",
    title: "San Francisco rent control expansion",
    jurisdiction: "San Francisco, CA",
    year: "1994",
    agentCount: 80,
    policy:
      "Extend rent control to small multi-family buildings, capping annual rent increases for existing tenants well below market growth, with just-cause eviction protections.",
    source: "Diamond, McQuade & Qian — “The Effects of Rent Control Expansion…”, American Economic Review (2019)",
    sourceUrl: "https://www.aeaweb.org/articles?id=10.1257/aer.20181289",
    summary:
      "Landmark study of SF's 1994 rent-control expansion: incumbent tenants gained durable protection, but covered landlords cut rental supply ~15%, which pushed up citywide rents and accelerated gentrification.",
    actuals: [
      { key: "supplyChangePct", label: "Rental housing supply", actual: "≈ −15% supply from covered landlords", direction: "down" },
      { key: "rentersBetterOffPct", label: "Incumbent tenants protected", actual: "Large transfer to incumbent renters", direction: "up" },
      { key: "displacementRate", label: "Displacement / gentrification", actual: "Increased turnover & gentrification", direction: "up" },
    ],
  },
  {
    id: "seattle-min-wage-2015",
    title: "Seattle $15 minimum wage",
    jurisdiction: "Seattle, WA",
    year: "2015–16",
    agentCount: 80,
    policy: "Raise the citywide minimum wage to $15.00 per hour, phased in over several years for all employers.",
    source: "Jardim et al. — “Minimum Wage Increases, Wages, and Low-Wage Employment”, NBER (2017)",
    sourceUrl: "https://www.nber.org/papers/w23532",
    summary:
      "Evidence from Seattle's phase-in: wages rose for low-wage workers, but employers cut scheduled hours (~9%), so net earnings gains for the lowest-paid were muted and uneven.",
    actuals: [
      { key: "lowWageHoursLossPct", label: "Low-wage hours", actual: "≈ −9% hours for low-wage jobs", direction: "down" },
      { key: "rentersBetterOffPct", label: "Worker earnings", actual: "Modest, uneven net gains", direction: "mixed" },
    ],
  },
  {
    id: "minneapolis-2040-upzoning",
    title: "Minneapolis 2040 upzoning",
    jurisdiction: "Austin, TX",
    year: "2019",
    agentCount: 80,
    policy:
      "Eliminate single-family-only zoning citywide, allowing up to three units on any residential lot to expand housing supply over time.",
    source: "Pew / Minneapolis Fed analyses of the Minneapolis 2040 plan (2023–24)",
    sourceUrl: "https://www.pewtrusts.org/en/research-and-analysis/articles/2024/02/local-zoning-reform",
    summary:
      "Ending single-family zoning gradually increased multifamily permitting and helped keep rents flatter than peer cities — a slow, supply-side effect rather than an immediate one. (Modeled here on a comparable city profile.)",
    actuals: [
      { key: "supplyChangePct", label: "Housing supply", actual: "Gradual supply increase", direction: "up" },
      { key: "avgRentBurdenDeltaPct", label: "Rent pressure", actual: "Rents grew slower than peers", direction: "down" },
    ],
  },
];

export function getCase(id: string): HistoricalCase | undefined {
  return HISTORICAL_CASES.find((c) => c.id === id);
}
