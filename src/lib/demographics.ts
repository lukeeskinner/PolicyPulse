import type {
  DemographicProfile,
  GroupStats,
  IncomeBracket,
  Neighborhood,
  SectorShare,
  SourceRef,
} from "./types";

// ============================================================================
// Grounded demographic datasets.
//
// Figures are approximate, drawn from the shape of U.S. Census / ACS 5-year
// estimates, BLS OES employment data, and Zillow/market rent indices. They are
// intended to be directionally realistic (especially the disparities across
// race, income, and tenure that drive the inequality analysis) but should be
// treated as illustrative, not authoritative. When Browserbase ingestion is
// enabled with live keys, these are replaced by freshly crawled values.
// ============================================================================

export const GROUP_ORDER = ["Black", "Hispanic", "Asian", "White", "Other"] as const;

const STANDARD_INCOME_BRACKETS: IncomeBracket[] = [
  { label: "<$30k", share: 0.22, min: 8000, max: 30000 },
  { label: "$30–60k", share: 0.24, min: 30000, max: 60000 },
  { label: "$60–100k", share: 0.24, min: 60000, max: 100000 },
  { label: "$100–150k", share: 0.16, min: 100000, max: 150000 },
  { label: "$150k+", share: 0.14, min: 150000, max: 320000 },
];

function sectorSet(over: Partial<Record<string, number>> = {}): SectorShare[] {
  // lowWageShare = fraction of that sector's workers in low-wage/hourly roles
  const base: SectorShare[] = [
    { label: "Food & Hospitality", share: 0.13, lowWageShare: 0.82 },
    { label: "Retail", share: 0.11, lowWageShare: 0.74 },
    { label: "Healthcare", share: 0.14, lowWageShare: 0.38 },
    { label: "Tech & Professional", share: 0.18, lowWageShare: 0.08 },
    { label: "Construction & Trades", share: 0.09, lowWageShare: 0.42 },
    { label: "Education", share: 0.1, lowWageShare: 0.3 },
    { label: "Logistics & Transport", share: 0.1, lowWageShare: 0.55 },
    { label: "Government & Public", share: 0.08, lowWageShare: 0.22 },
    { label: "Care & Domestic", share: 0.07, lowWageShare: 0.88 },
  ];
  return base.map((s) => (over[s.label] != null ? { ...s, share: over[s.label]! } : s));
}

function g(
  share: number,
  medianIncome: number,
  renterShare: number,
  immigrantShare: number,
): GroupStats {
  return { share, medianIncome, renterShare, immigrantShare };
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

const OAKLAND: DemographicProfile = {
  jurisdiction: "Oakland, CA",
  state: "CA",
  population: 440646,
  households: 173405,
  medianIncome: 93146,
  medianRent: 1944,
  renterShare: 0.59,
  groups: {
    Black: g(0.22, 51800, 0.71, 0.08),
    Hispanic: g(0.27, 69400, 0.66, 0.41),
    Asian: g(0.155, 94900, 0.52, 0.62),
    White: g(0.28, 132500, 0.47, 0.14),
    Other: g(0.075, 74200, 0.61, 0.22),
  },
  neighborhoods: [
    { name: "East Oakland", share: 0.27, medianRent: 1620, gentrification: 0.74, incomeIndex: 0.62 },
    { name: "Fruitvale", share: 0.14, medianRent: 1710, gentrification: 0.68, incomeIndex: 0.68 },
    { name: "West Oakland", share: 0.11, medianRent: 1880, gentrification: 0.86, incomeIndex: 0.71 },
    { name: "Downtown / Uptown", share: 0.12, medianRent: 2450, gentrification: 0.72, incomeIndex: 1.02 },
    { name: "Chinatown", share: 0.06, medianRent: 1560, gentrification: 0.4, incomeIndex: 0.7 },
    { name: "Temescal / Rockridge", share: 0.13, medianRent: 2790, gentrification: 0.55, incomeIndex: 1.48 },
    { name: "Oakland Hills", share: 0.17, medianRent: 3100, gentrification: 0.18, incomeIndex: 1.74 },
  ],
  incomeBrackets: STANDARD_INCOME_BRACKETS,
  sectors: sectorSet(),
  grounded: true,
  sources: [],
};

const SAN_FRANCISCO: DemographicProfile = {
  jurisdiction: "San Francisco, CA",
  state: "CA",
  population: 808437,
  households: 359357,
  medianIncome: 136692,
  medianRent: 3038,
  renterShare: 0.62,
  groups: {
    Black: g(0.05, 60100, 0.78, 0.1),
    Hispanic: g(0.15, 89500, 0.7, 0.45),
    Asian: g(0.34, 112400, 0.56, 0.66),
    White: g(0.39, 164900, 0.55, 0.2),
    Other: g(0.07, 96800, 0.66, 0.3),
  },
  neighborhoods: [
    { name: "Mission District", share: 0.13, medianRent: 3050, gentrification: 0.88, incomeIndex: 0.92 },
    { name: "Bayview–Hunters Point", share: 0.09, medianRent: 2450, gentrification: 0.79, incomeIndex: 0.6 },
    { name: "Tenderloin / SoMa", share: 0.11, medianRent: 2680, gentrification: 0.62, incomeIndex: 0.66 },
    { name: "Chinatown", share: 0.06, medianRent: 2100, gentrification: 0.41, incomeIndex: 0.62 },
    { name: "Sunset / Richmond", share: 0.22, medianRent: 2950, gentrification: 0.46, incomeIndex: 1.04 },
    { name: "Marina / Pacific Heights", share: 0.14, medianRent: 3950, gentrification: 0.32, incomeIndex: 1.82 },
    { name: "Outer neighborhoods", share: 0.25, medianRent: 3000, gentrification: 0.5, incomeIndex: 1.1 },
  ],
  incomeBrackets: [
    { label: "<$30k", share: 0.16, min: 8000, max: 30000 },
    { label: "$30–60k", share: 0.16, min: 30000, max: 60000 },
    { label: "$60–100k", share: 0.18, min: 60000, max: 100000 },
    { label: "$100–150k", share: 0.2, min: 100000, max: 150000 },
    { label: "$150k+", share: 0.3, min: 150000, max: 420000 },
  ],
  sectors: sectorSet({ "Tech & Professional": 0.27, "Food & Hospitality": 0.11 }),
  grounded: true,
  sources: [],
};

const SEATTLE: DemographicProfile = {
  jurisdiction: "Seattle, WA",
  state: "WA",
  population: 749256,
  households: 348519,
  medianIncome: 116068,
  medianRent: 2174,
  renterShare: 0.54,
  groups: {
    Black: g(0.07, 56300, 0.72, 0.18),
    Hispanic: g(0.07, 84200, 0.64, 0.34),
    Asian: g(0.17, 108900, 0.52, 0.58),
    White: g(0.62, 132700, 0.48, 0.13),
    Other: g(0.07, 88100, 0.6, 0.22),
  },
  neighborhoods: [
    { name: "Rainier Valley", share: 0.13, medianRent: 1850, gentrification: 0.8, incomeIndex: 0.68 },
    { name: "Central District", share: 0.08, medianRent: 2100, gentrification: 0.86, incomeIndex: 0.82 },
    { name: "Capitol Hill", share: 0.12, medianRent: 2250, gentrification: 0.6, incomeIndex: 1.0 },
    { name: "Ballard", share: 0.11, medianRent: 2300, gentrification: 0.55, incomeIndex: 1.12 },
    { name: "Beacon Hill", share: 0.09, medianRent: 1950, gentrification: 0.72, incomeIndex: 0.78 },
    { name: "Downtown / SLU", share: 0.18, medianRent: 2650, gentrification: 0.5, incomeIndex: 1.2 },
    { name: "North Seattle", share: 0.29, medianRent: 2200, gentrification: 0.4, incomeIndex: 1.22 },
  ],
  incomeBrackets: STANDARD_INCOME_BRACKETS,
  sectors: sectorSet({ "Tech & Professional": 0.24 }),
  grounded: true,
  sources: [],
};

const AUSTIN: DemographicProfile = {
  jurisdiction: "Austin, TX",
  state: "TX",
  population: 961855,
  households: 386787,
  medianIncome: 86556,
  medianRent: 1640,
  renterShare: 0.55,
  groups: {
    Black: g(0.07, 51600, 0.66, 0.1),
    Hispanic: g(0.32, 62300, 0.6, 0.36),
    Asian: g(0.09, 102400, 0.5, 0.64),
    White: g(0.48, 98800, 0.48, 0.1),
    Other: g(0.04, 70200, 0.58, 0.24),
  },
  neighborhoods: [
    { name: "East Austin", share: 0.16, medianRent: 1550, gentrification: 0.85, incomeIndex: 0.72 },
    { name: "Dove Springs", share: 0.1, medianRent: 1320, gentrification: 0.6, incomeIndex: 0.58 },
    { name: "North Lamar", share: 0.12, medianRent: 1410, gentrification: 0.55, incomeIndex: 0.7 },
    { name: "Downtown", share: 0.1, medianRent: 2350, gentrification: 0.45, incomeIndex: 1.4 },
    { name: "South Congress", share: 0.13, medianRent: 1850, gentrification: 0.7, incomeIndex: 1.05 },
    { name: "West Austin", share: 0.17, medianRent: 2200, gentrification: 0.3, incomeIndex: 1.65 },
    { name: "Suburban North", share: 0.22, medianRent: 1600, gentrification: 0.35, incomeIndex: 1.05 },
  ],
  incomeBrackets: STANDARD_INCOME_BRACKETS,
  sectors: sectorSet({ "Tech & Professional": 0.22, "Construction & Trades": 0.11 }),
  grounded: true,
  sources: [],
};

const NEW_YORK: DemographicProfile = {
  jurisdiction: "New York, NY",
  state: "NY",
  population: 8335897,
  households: 3210815,
  medianIncome: 76607,
  medianRent: 1726,
  renterShare: 0.68,
  groups: {
    Black: g(0.22, 54600, 0.79, 0.28),
    Hispanic: g(0.29, 50900, 0.78, 0.42),
    Asian: g(0.14, 76400, 0.6, 0.7),
    White: g(0.31, 102900, 0.62, 0.22),
    Other: g(0.04, 64200, 0.72, 0.34),
  },
  neighborhoods: [
    { name: "South Bronx", share: 0.13, medianRent: 1450, gentrification: 0.7, incomeIndex: 0.5 },
    { name: "Central Brooklyn", share: 0.16, medianRent: 1980, gentrification: 0.88, incomeIndex: 0.74 },
    { name: "Washington Heights", share: 0.08, medianRent: 1820, gentrification: 0.66, incomeIndex: 0.7 },
    { name: "Jackson Heights", share: 0.09, medianRent: 1900, gentrification: 0.58, incomeIndex: 0.82 },
    { name: "Lower Manhattan", share: 0.11, medianRent: 3650, gentrification: 0.4, incomeIndex: 1.9 },
    { name: "Upper East/West Side", share: 0.16, medianRent: 3200, gentrification: 0.3, incomeIndex: 1.7 },
    { name: "Outer Queens", share: 0.27, medianRent: 1850, gentrification: 0.45, incomeIndex: 0.95 },
  ],
  incomeBrackets: [
    { label: "<$30k", share: 0.26, min: 8000, max: 30000 },
    { label: "$30–60k", share: 0.24, min: 30000, max: 60000 },
    { label: "$60–100k", share: 0.2, min: 60000, max: 100000 },
    { label: "$100–150k", share: 0.14, min: 100000, max: 150000 },
    { label: "$150k+", share: 0.16, min: 150000, max: 450000 },
  ],
  sectors: sectorSet({ "Food & Hospitality": 0.14, "Healthcare": 0.16 }),
  grounded: true,
  sources: [],
};

const DATASETS: DemographicProfile[] = [OAKLAND, SAN_FRANCISCO, SEATTLE, AUSTIN, NEW_YORK];

export const SUPPORTED_JURISDICTIONS = DATASETS.map((d) => d.jurisdiction);

// ---------------------------------------------------------------------------
// National fallback (used when a jurisdiction has no dataset and no live crawl)
// ---------------------------------------------------------------------------

function nationalFallback(name: string): DemographicProfile {
  return {
    jurisdiction: name,
    state: "US",
    population: 250000,
    households: 96000,
    medianIncome: 74580,
    medianRent: 1430,
    renterShare: 0.36,
    groups: {
      Black: g(0.134, 52860, 0.58, 0.1),
      Hispanic: g(0.19, 62800, 0.52, 0.33),
      Asian: g(0.062, 108700, 0.41, 0.66),
      White: g(0.585, 81000, 0.27, 0.05),
      Other: g(0.029, 65200, 0.45, 0.22),
    },
    neighborhoods: [
      { name: "Downtown Core", share: 0.14, medianRent: 1620, gentrification: 0.6, incomeIndex: 1.0 },
      { name: "Older East Side", share: 0.2, medianRent: 1180, gentrification: 0.55, incomeIndex: 0.66 },
      { name: "South Industrial", share: 0.16, medianRent: 1090, gentrification: 0.4, incomeIndex: 0.6 },
      { name: "Midtown", share: 0.18, medianRent: 1450, gentrification: 0.45, incomeIndex: 1.02 },
      { name: "North Suburbs", share: 0.18, medianRent: 1650, gentrification: 0.25, incomeIndex: 1.4 },
      { name: "West Hills", share: 0.14, medianRent: 1850, gentrification: 0.18, incomeIndex: 1.6 },
    ],
    incomeBrackets: STANDARD_INCOME_BRACKETS,
    sectors: sectorSet(),
    grounded: false,
    sources: [],
    notes: `No local dataset for "${name}". Synthesized from U.S. national ACS averages.`,
  };
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

export function getBaseProfile(jurisdiction: string): DemographicProfile {
  const q = normalize(jurisdiction);
  for (const d of DATASETS) {
    const city = normalize(d.jurisdiction.split(",")[0]);
    if (q.includes(city) || city.includes(q)) {
      return structuredClone(d);
    }
  }
  return nationalFallback(jurisdiction.trim() || "Anytown, USA");
}

// Source citations describing what Browserbase would crawl for a jurisdiction.
export function sourcesFor(profile: DemographicProfile): SourceRef[] {
  const city = profile.jurisdiction;
  return [
    {
      label: "U.S. Census Bureau — QuickFacts",
      detail: `Population, race & ethnicity composition for ${city}`,
      url: "https://www.census.gov/quickfacts",
      kind: "census",
    },
    {
      label: "ACS 5-Year Estimates (Table B19013 / B25003)",
      detail: "Median household income & owner-vs-renter tenure by tract",
      url: "https://data.census.gov",
      kind: "acs",
    },
    {
      label: "BLS — Occupational Employment & Wage Statistics",
      detail: `Sector employment and low-wage role share for ${profile.state}`,
      url: "https://www.bls.gov/oes/",
      kind: "bls",
    },
    {
      label: "Zillow Observed Rent Index (ZORI)",
      detail: `Current median asking rent (${profile.medianRent.toLocaleString()}/mo) by ZIP`,
      url: "https://www.zillow.com/research/data/",
      kind: "market",
    },
    {
      label: "Local Housing Authority data",
      detail: "Subsidized units, waitlist length, eviction filings",
      kind: "housing",
    },
    {
      label: "City Council meeting minutes",
      detail: "Public comments and stakeholder positions on the measure",
      kind: "minutes",
    },
    {
      label: "Local news coverage",
      detail: `Reporting on the proposed measure in ${city}`,
      kind: "news",
    },
  ];
}

export function neighborhoodByName(
  profile: DemographicProfile,
  name: string,
): Neighborhood | undefined {
  return profile.neighborhoods.find((n) => n.name === name);
}
