import type { DemographicProfile, IncomeBracket, Persona, Role, Tenure } from "./types";
import {
  allocateCounts,
  clamp,
  RNG,
  rngNormal,
  shortId,
  weightedIndex,
} from "./utils";

// ============================================================================
// Proportional agent spawning.
//
// Turns a DemographicProfile into a set of individual synthetic residents whose
// joint distribution (race x neighborhood x income x tenure x sector) matches
// the real community. Neighborhood assignment is income-correlated so spatial
// segregation patterns emerge, which is what makes the inequality view bite.
// ============================================================================

// Modest, clearly-synthetic name pools used only to give personas a human face
// in the UI. These are illustrative, not representative of any real person.
const FIRST_NAMES: Record<string, string[]> = {
  Black: ["Andre", "Imani", "Marcus", "Tasha", "Darnell", "Keisha", "Terrence", "Aaliyah", "Jamal", "Nia"],
  Hispanic: ["Mateo", "Lucia", "Diego", "Rosa", "Javier", "Carmen", "Esteban", "Marisol", "Hector", "Valeria"],
  Asian: ["Wei", "Mei", "Hiro", "Linh", "Jin", "Priya", "Kenji", "Anjali", "Thuy", "Raj"],
  White: ["Ethan", "Claire", "Logan", "Megan", "Brett", "Hannah", "Cole", "Sarah", "Derek", "Emily"],
  Other: ["Sam", "Noor", "Alex", "Aya", "Jordan", "Leila", "Kai", "Yusuf", "Riley", "Amara"],
};
const LAST_NAMES: Record<string, string[]> = {
  Black: ["Jefferson", "Washington", "Coleman", "Banks", "Freeman", "Dawson", "Greene", "Mosley"],
  Hispanic: ["García", "Hernández", "Ramírez", "Torres", "Flores", "Vargas", "Castillo", "Reyes"],
  Asian: ["Nguyen", "Chen", "Patel", "Kim", "Tran", "Wong", "Singh", "Yamamoto"],
  White: ["Miller", "Anderson", "Carter", "Sullivan", "Bennett", "Hayes", "Fletcher", "Walsh"],
  Other: ["Haddad", "Okafor", "Silva", "Khan", "Abebe", "Ali", "Costa", "Mensah"],
};

function pickName(rng: RNG, group: string): string {
  const fp = FIRST_NAMES[group] ?? FIRST_NAMES.Other;
  const lp = LAST_NAMES[group] ?? LAST_NAMES.Other;
  const first = fp[Math.floor(rng() * fp.length)];
  const last = lp[Math.floor(rng() * lp.length)];
  return `${first} ${last}`;
}

function bracketFor(income: number, brackets: IncomeBracket[]): string {
  for (const b of brackets) if (income >= b.min && income < b.max) return b.label;
  return brackets[brackets.length - 1].label;
}

function sampleHouseholdSize(rng: RNG): number {
  const weights = [0.3, 0.3, 0.18, 0.12, 0.06, 0.04];
  return weightedIndex(rng, weights) + 1;
}

export interface SpawnResult {
  personas: Persona[];
  breakdown: Record<string, number>;
}

export function spawnPersonas(
  profile: DemographicProfile,
  agentCount: number,
  rng: RNG,
): SpawnResult {
  const groupShares: Record<string, number> = {};
  for (const [k, v] of Object.entries(profile.groups)) groupShares[k] = v.share;
  const counts = allocateCounts(groupShares, agentCount);

  const personas: Persona[] = [];

  for (const [group, n] of Object.entries(counts)) {
    const gs = profile.groups[group];
    const groupAffluence = gs.medianIncome / profile.medianIncome;

    for (let i = 0; i < n; i++) {
      // --- neighborhood (income-correlated affinity) ---
      const nWeights = profile.neighborhoods.map((nb) => {
        const diff = Math.abs(Math.log(groupAffluence + 0.1) - Math.log(nb.incomeIndex));
        return nb.share * Math.exp(-diff * 1.2);
      });
      const nb = profile.neighborhoods[weightedIndex(rng, nWeights)];

      // --- age ---
      const age = Math.round(clamp(rngNormal(rng, 39, 15), 19, 86));

      // --- income (blend group median + neighborhood, lognormal spread) ---
      const nAdj = clamp(nb.incomeIndex, 0.5, 2.0);
      const med = gs.medianIncome * (0.55 + 0.45 * nAdj);
      const income = Math.round(
        clamp(med * Math.exp(rngNormal(rng, 0, 0.45)), 9000, 620000),
      );
      const incomeBracket = bracketFor(income, profile.incomeBrackets);

      // --- tenure ---
      let renterProb = gs.renterShare;
      if (nb.incomeIndex > 1.4) renterProb *= 0.7;
      if (income > 180000) renterProb -= 0.18;
      renterProb = clamp(renterProb, 0.05, 0.96);
      const tenure: Tenure = rng() < renterProb ? "renter" : "owner";

      // --- household & housing cost ---
      const householdSize = sampleHouseholdSize(rng);
      const hhAdj = 0.85 + householdSize * 0.06;
      let monthlyHousingCost: number;
      if (tenure === "renter") {
        monthlyHousingCost = nb.medianRent * hhAdj * Math.exp(rngNormal(rng, 0, 0.16));
        const maxBurden = (income * 0.85) / 12;
        const minBurden = (income * 0.12) / 12;
        monthlyHousingCost = clamp(monthlyHousingCost, minBurden, maxBurden);
      } else {
        const mortgage = nb.medianRent * 1.18 * hhAdj * Math.exp(rngNormal(rng, 0, 0.14));
        monthlyHousingCost = clamp(mortgage, (income * 0.1) / 12, (income * 0.42) / 12);
      }
      monthlyHousingCost = Math.round(monthlyHousingCost);

      // --- sector & low-wage flag ---
      const sector =
        profile.sectors[weightedIndex(rng, profile.sectors.map((s) => s.share))];

      // --- roles ---
      const roles: Role[] = [];
      roles.push(tenure === "renter" ? "renter" : "owner");
      let worker = true;
      if (age >= 67) {
        roles.push("retiree");
        worker = rng() < 0.15;
      }
      if (age <= 24 && rng() < 0.32) roles.push("student");
      if (worker) roles.push("worker");
      if (tenure === "owner" && rng() < 0.2) roles.push("small_landlord");
      if (income > 120000 && rng() < 0.16) roles.push("business_owner");
      else if (income > 70000 && rng() < 0.07) roles.push("business_owner");
      if (!roles.includes("worker") && !roles.includes("retiree") && !roles.includes("student")) {
        roles.push("worker");
      }

      const lowWage =
        roles.includes("worker") && income < 56000 && rng() < sector.lowWageShare + 0.08;

      // --- savings ---
      const savings = Math.round(
        clamp(
          income * (tenure === "owner" ? 0.55 : 0.11) * Math.exp(rngNormal(rng, 0, 0.5)) -
            (lowWage ? 2500 : 0),
          0,
          2_500_000,
        ),
      );

      // --- nativity ---
      const nativity = rng() < gs.immigrantShare ? "immigrant" : "native";

      personas.push({
        id: shortId("ag"),
        name: pickName(rng, group),
        group,
        nativity,
        age,
        householdSize,
        tenure,
        neighborhood: nb.name,
        sector: sector.label,
        roles,
        incomeBracket,
        income,
        monthlyHousingCost,
        savings,
        colorKey: group,
        lowWage,
      });
    }
  }

  // Shuffle so the spawn animation interleaves groups instead of clustering.
  for (let i = personas.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [personas[i], personas[j]] = [personas[j], personas[i]];
  }

  return { personas, breakdown: counts };
}
