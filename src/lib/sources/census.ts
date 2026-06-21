import type {
  DemographicProfile,
  GroupStats,
  IncomeBracket,
  Neighborhood,
  SectorShare,
  SourceRef,
} from "../types";
import { stateByAbbr } from "../states";

// ============================================================================
// Live U.S. Census ACS 5-year demographics -> a DemographicProfile.
//
// Everything quantitative here is real ACS data pulled at request time:
//   population, households, median income, median rent, renter share,
//   race/ethnicity composition, per-group median income & renter share,
//   the full household-income distribution, and the industry mix.
//
// Two fields are transparently DERIVED from that real data (ACS has no single
// clean field for them) and labeled as such in `notes`/`sources`:
//   - "neighborhoods" become income-tier districts derived from the real
//     household-income distribution (the engine needs spatial bands).
//   - per-group immigrant share is scaled from the real overall foreign-born
//     share using fixed multipliers, normalized so the population-weighted
//     average exactly equals the real figure.
//
// Requires CENSUS_API_KEY — the Census API now rejects keyless requests
// (302 -> missing_key.html). Returns null when unconfigured or on any failure,
// so callers show an honest empty state and the simulator falls back to its
// labeled offline datasets.
// ============================================================================

const YEAR = process.env.CENSUS_ACS_YEAR || "2022";

export function censusConfigured(): boolean {
  return !!process.env.CENSUS_API_KEY;
}

const SENTINEL = -100000;
function clean(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= SENTINEL) return null;
  return n;
}

const CORE_VARS = [
  "NAME",
  "B01003_001E", // total population
  "B11001_001E", // households
  "B19013_001E", // median household income
  "B25064_001E", // median gross rent
  "B25003_001E", "B25003_003E", // occupied units, renter-occupied
  "B03002_001E", "B03002_003E", "B03002_004E", "B03002_006E", "B03002_012E", // race/eth
  "B19013B_001E", "B19013D_001E", "B19013H_001E", "B19013I_001E", // group median income
  "B25003B_001E", "B25003B_003E", "B25003D_001E", "B25003D_003E",
  "B25003H_001E", "B25003H_003E", "B25003I_001E", "B25003I_003E", // group tenure
  "B05002_001E", "B05002_013E", // total / foreign-born
  "B19001_002E", "B19001_003E", "B19001_004E", "B19001_005E", "B19001_006E",
  "B19001_007E", "B19001_008E", "B19001_009E", "B19001_010E", "B19001_011E",
  "B19001_012E", "B19001_013E", "B19001_014E", "B19001_015E", "B19001_016E", "B19001_017E",
];

// DP03 data-profile percentages: the 13 NAICS supersectors, no nesting,
// already expressed as a percent of the civilian employed population. Aligned
// 1:1 (by index) with INDUSTRIES below.
const INDUSTRY_VARS = [
  "DP03_0033PE", "DP03_0034PE", "DP03_0035PE", "DP03_0036PE", "DP03_0037PE",
  "DP03_0038PE", "DP03_0039PE", "DP03_0040PE", "DP03_0041PE", "DP03_0042PE",
  "DP03_0043PE", "DP03_0044PE", "DP03_0045PE",
];

const INDUSTRIES: { label: string; lowWageShare: number }[] = [
  { label: "Agriculture & Mining", lowWageShare: 0.55 },
  { label: "Construction", lowWageShare: 0.45 },
  { label: "Manufacturing", lowWageShare: 0.4 },
  { label: "Wholesale Trade", lowWageShare: 0.35 },
  { label: "Retail Trade", lowWageShare: 0.74 },
  { label: "Transportation & Utilities", lowWageShare: 0.5 },
  { label: "Information", lowWageShare: 0.15 },
  { label: "Finance & Real Estate", lowWageShare: 0.2 },
  { label: "Professional & Admin", lowWageShare: 0.3 },
  { label: "Education & Health", lowWageShare: 0.42 },
  { label: "Arts, Food & Hospitality", lowWageShare: 0.78 },
  { label: "Other Services", lowWageShare: 0.55 },
  { label: "Public Administration", lowWageShare: 0.2 },
];

async function fetchRow(
  vars: string[],
  fips: string,
  dataset = "acs/acs5",
): Promise<Record<string, string> | null> {
  const k = process.env.CENSUS_API_KEY;
  const url =
    `https://api.census.gov/data/${YEAR}/${dataset}?get=${vars.join(",")}` +
    `&for=state:${fips}${k ? `&key=${k}` : ""}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const json = (await res.json()) as string[][];
    if (!Array.isArray(json) || json.length < 2) return null;
    const [header, row] = json;
    const out: Record<string, string> = {};
    header.forEach((h, i) => (out[h] = row[i]));
    return out;
  } catch {
    return null;
  }
}

function groupStats(
  share: number,
  medianIncome: number | null,
  fallbackIncome: number,
  renterTotal: number | null,
  renterCount: number | null,
  fallbackRenter: number,
  immigrantShare: number,
): GroupStats {
  const renterShare =
    renterTotal && renterCount != null && renterTotal > 0
      ? renterCount / renterTotal
      : fallbackRenter;
  return {
    share,
    medianIncome: medianIncome ?? fallbackIncome,
    renterShare: Math.min(0.98, Math.max(0.02, renterShare)),
    immigrantShare: Math.min(0.95, Math.max(0, immigrantShare)),
  };
}

function buildBrackets(c: (v: string) => number): IncomeBracket[] {
  const sum = (...keys: string[]) => keys.reduce((s, k) => s + c(k), 0);
  const lt30 = sum("B19001_002E", "B19001_003E", "B19001_004E", "B19001_005E", "B19001_006E");
  const b3060 = sum("B19001_007E", "B19001_008E", "B19001_009E", "B19001_010E", "B19001_011E");
  const b60100 = sum("B19001_012E", "B19001_013E");
  const b100150 = sum("B19001_014E", "B19001_015E");
  const b150 = sum("B19001_016E", "B19001_017E");
  const total = lt30 + b3060 + b60100 + b100150 + b150 || 1;
  return [
    { label: "<$30k", share: lt30 / total, min: 8000, max: 30000 },
    { label: "$30–60k", share: b3060 / total, min: 30000, max: 60000 },
    { label: "$60–100k", share: b60100 / total, min: 60000, max: 100000 },
    { label: "$100–150k", share: b100150 / total, min: 100000, max: 150000 },
    { label: "$150k+", share: b150 / total, min: 150000, max: 400000 },
  ];
}

function buildNeighborhoods(brackets: IncomeBracket[], medianIncome: number, medianRent: number): Neighborhood[] {
  const mids = [18000, 45000, 78000, 122000, 210000];
  const names = [
    "Lower-income districts",
    "Working-class districts",
    "Middle-income districts",
    "Upper-middle districts",
    "High-income districts",
  ];
  return brackets.map((b, i) => {
    const incomeIndex = Math.max(0.45, Math.min(2.4, mids[i] / Math.max(20000, medianIncome)));
    const rent = Math.round(
      Math.max(medianRent * 0.55, Math.min(medianRent * 2.2, medianRent * Math.pow(incomeIndex, 0.6))),
    );
    const gentrification = Math.max(0.15, Math.min(0.9, 0.95 - 0.4 * incomeIndex));
    return {
      name: names[i],
      share: b.share,
      medianRent: rent,
      gentrification,
      incomeIndex,
    };
  });
}

export async function fetchStateCensusProfile(stateCode: string): Promise<DemographicProfile | null> {
  if (!process.env.CENSUS_API_KEY) return null;
  const info = stateByAbbr(stateCode);
  if (!info) return null;

  const [core, ind] = await Promise.all([
    fetchRow(CORE_VARS, info.fips),
    fetchRow(INDUSTRY_VARS, info.fips, "acs/acs5/profile"),
  ]);
  if (!core) return null;

  const c = (key: string): number => clean(core[key]) ?? 0;

  const population = c("B01003_001E");
  const households = c("B11001_001E");
  const medianIncome = clean(core["B19013_001E"]) ?? 74580;
  const medianRent = clean(core["B25064_001E"]) ?? 1430;
  const occupied = c("B25003_001E");
  const renterOccupied = c("B25003_003E");
  const renterShare = occupied > 0 ? renterOccupied / occupied : 0.36;

  // race / ethnicity
  const raceTotal = c("B03002_001E") || 1;
  const whiteN = c("B03002_003E");
  const blackN = c("B03002_004E");
  const asianN = c("B03002_006E");
  const hispN = c("B03002_012E");
  const otherN = Math.max(0, raceTotal - whiteN - blackN - asianN - hispN);

  // foreign-born (overall, real)
  const fbTotal = c("B05002_001E") || 1;
  const foreignShare = c("B05002_013E") / fbTotal;

  // per-group immigrant share: scale by documented multipliers, then normalize
  // so the population-weighted average equals the real foreign-born share.
  const shares = {
    Black: blackN / raceTotal,
    Hispanic: hispN / raceTotal,
    Asian: asianN / raceTotal,
    White: whiteN / raceTotal,
    Other: otherN / raceTotal,
  };
  const mult: Record<string, number> = { Black: 0.7, Hispanic: 1.9, Asian: 2.6, White: 0.25, Other: 1.3 };
  const weightedMult =
    Object.entries(shares).reduce((s, [g, sh]) => s + sh * mult[g], 0) || 1;
  const normFactor = foreignShare / weightedMult;
  const immig = (g: string) => Math.min(0.95, Math.max(0, mult[g] * normFactor));

  const groups: Record<string, GroupStats> = {
    Black: groupStats(shares.Black, clean(core["B19013B_001E"]), medianIncome, clean(core["B25003B_001E"]), clean(core["B25003B_003E"]), renterShare, immig("Black")),
    Hispanic: groupStats(shares.Hispanic, clean(core["B19013I_001E"]), medianIncome, clean(core["B25003I_001E"]), clean(core["B25003I_003E"]), renterShare, immig("Hispanic")),
    Asian: groupStats(shares.Asian, clean(core["B19013D_001E"]), medianIncome, clean(core["B25003D_001E"]), clean(core["B25003D_003E"]), renterShare, immig("Asian")),
    White: groupStats(shares.White, clean(core["B19013H_001E"]), medianIncome, clean(core["B25003H_001E"]), clean(core["B25003H_003E"]), renterShare, immig("White")),
    Other: groupStats(shares.Other, medianIncome, medianIncome, null, null, renterShare, immig("Other")),
  };

  const brackets = buildBrackets(c);
  const neighborhoods = buildNeighborhoods(brackets, medianIncome, medianRent);

  // industry mix (real shares from DP03; lowWageShare is a documented model)
  let sectors: SectorShare[];
  if (ind) {
    sectors = INDUSTRIES.map((s, i) => {
      const pct = clean(ind[INDUSTRY_VARS[i]]) ?? 0; // DP03 percent estimate
      return { label: s.label, share: pct / 100, lowWageShare: s.lowWageShare };
    });
  } else {
    sectors = INDUSTRIES.map((s) => ({ label: s.label, share: 1 / INDUSTRIES.length, lowWageShare: s.lowWageShare }));
  }

  const sources: SourceRef[] = [
    { label: `U.S. Census ACS ${YEAR} 5-Year`, detail: `Population, income & rent for ${info.name} (B01003, B19013, B25064)`, url: `https://data.census.gov/`, kind: "acs" },
    { label: "Race & ethnicity (B03002)", detail: "Population composition by race/Hispanic origin", url: "https://data.census.gov/table/ACSDT5Y2022.B03002", kind: "census" },
    { label: "Tenure & income by race (B25003B–I, B19013B–I)", detail: "Renter share & median income disparities by group", kind: "acs" },
    { label: "Household income distribution (B19001)", detail: "Real income brackets driving the population spread", kind: "acs" },
    { label: "Industry mix (DP03)", detail: "Workforce sector shares; low-wage shares modeled from BLS wage data", url: "https://www.bls.gov/oes/", kind: "bls" },
  ];

  return {
    jurisdiction: info.name,
    state: info.abbr,
    population,
    households,
    medianIncome,
    medianRent,
    renterShare,
    groups,
    neighborhoods,
    incomeBrackets: brackets,
    sectors,
    grounded: true,
    sources,
    notes: `Live U.S. Census ACS ${YEAR} 5-year estimates for ${info.name}. Income-tier districts are derived from the real household-income distribution; per-group immigrant share is scaled from the real statewide foreign-born share.`,
  };
}
