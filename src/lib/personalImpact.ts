import {
  computeWellbeing,
  INCOME_GROWTH,
  personaAlignment,
  TIME_PROFILES,
} from "./engine";
import {
  ROUNDS,
  type Channel,
  type DemographicProfile,
  type IncomeBracket,
  type Outcome,
  type Persona,
  type PersonalChannel,
  type PersonalImpact,
  type PersonalReason,
  type PolicyModel,
  type Role,
  type UnintendedConsequence,
  type UserPersona,
} from "./types";
import { clamp, fmtUSD } from "./utils";

// ============================================================================
// Direct ("no simulation") personal impact.
//
// Projects a SINGLE user-defined persona through a PolicyModel deterministically
// — same per-round forces the SimulationEngine applies in `updateAgent` (income
// drift, rent caps, wage floors, per-channel exposure scaled by alignment), but
// with NO random second-order cascades and NO agent population. Displacement and
// job loss are therefore never *asserted* here; they surface as honest risk
// flags drawn from the policy's own unintended consequences.
//
// IMPORTANT: the per-round arithmetic below intentionally mirrors the
// deterministic backbone of SimulationEngine.updateAgent. If that math changes,
// keep this in sync. The two share `personaAlignment` + `computeWellbeing`
// directly so the "who is affected / how good or bad" scoring can never drift.
// ============================================================================

const LOW_WAGE_CEILING = 56_000; // matches the spawner's low-wage income cutoff

// --- map the human-entered persona onto a full engine Persona ---------------

function bracketLabel(income: number, brackets: IncomeBracket[]): string {
  for (const b of brackets) if (income >= b.min && income < b.max) return b.label;
  return brackets[brackets.length - 1]?.label ?? "—";
}

/** Pick the neighborhood whose income index best matches the persona (cosmetic). */
function pickNeighborhood(profile: DemographicProfile, affluence: number): string {
  if (!profile.neighborhoods.length) return "your area";
  let best = profile.neighborhoods[0];
  let bestDiff = Infinity;
  for (const nb of profile.neighborhoods) {
    const diff = Math.abs(Math.log(affluence + 0.1) - Math.log(nb.incomeIndex));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = nb;
    }
  }
  return best.name;
}

// When the user declines to disclose a group, we use a sentinel that matches
// NO policy demographic key — so "Prefer not to say" genuinely opts out of any
// group-based alignment rather than silently falling into the "Other" bucket.
export const UNSPECIFIED_GROUP = "Unspecified";

export function toEnginePersona(u: UserPersona, profile: DemographicProfile): Persona {
  const group = u.group ?? UNSPECIFIED_GROUP;
  const tenureRole: Role = u.tenure === "renter" ? "renter" : "owner";
  // Tenure role + the user's chosen primary role (deduped).
  const roles: Role[] = Array.from(new Set<Role>([tenureRole, u.role]));
  const employed = roles.includes("worker");
  const lowWage = employed && u.income < LOW_WAGE_CEILING;
  const affluence = u.income / Math.max(profile.medianIncome, 1);

  return {
    id: "you",
    name: u.name?.trim() || "You",
    group,
    nativity: u.nativity ?? "native",
    age: u.age,
    householdSize: u.householdSize,
    tenure: u.tenure,
    neighborhood: pickNeighborhood(profile, affluence),
    sector: u.sector?.trim() || "General",
    roles,
    incomeBracket: bracketLabel(u.income, profile.incomeBrackets),
    income: u.income,
    monthlyHousingCost: u.monthlyHousingCost,
    savings: u.savings ?? Math.round(u.income * (u.tenure === "owner" ? 0.4 : 0.1)),
    colorKey: group,
    lowWage,
  };
}

// --- labels -----------------------------------------------------------------

const ROLE_REASON: Record<string, string> = {
  renter: "As a renter",
  owner: "As a homeowner",
  worker: "As a worker",
  small_landlord: "As a small landlord",
  business_owner: "As a business owner",
  retiree: "As a retiree",
  student: "As a student",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  income: "Income",
  housing: "Housing costs",
  employment: "Employment",
  wealth: "Wealth",
  stability: "Stability",
};

function reasonLabel(key: string, group: string): string {
  if (ROLE_REASON[key]) return ROLE_REASON[key];
  if (key === group) {
    const article = /^[AEIOU]/.test(key) ? "an" : "a";
    return `As ${article} ${group} resident`;
  }
  return `As ${key}`;
}

/** Mirrors the membership test inside personaAlignment. */
function personaMatches(p: Persona, key: string): boolean {
  return (
    (p.roles as string[]).includes(key) ||
    key === p.group ||
    (key === "renter" && p.tenure === "renter") ||
    (key === "owner" && p.tenure === "owner")
  );
}

/** Which life channels are personally relevant to this persona. */
function channelRelevant(p: Persona, channel: Channel): boolean {
  switch (channel) {
    case "income":
      return true;
    case "housing":
      return true; // everyone pays rent or a mortgage
    case "employment":
      return p.roles.includes("worker") || p.roles.includes("business_owner");
    case "wealth":
      return (
        p.tenure === "owner" ||
        p.roles.includes("small_landlord") ||
        p.roles.includes("business_owner") ||
        p.savings > 0
      );
    case "stability":
      return p.tenure === "renter" || p.lowWage || p.nativity === "immigrant";
  }
}

// --- the projection ---------------------------------------------------------

export function assessPersonalImpact(
  u: UserPersona,
  model: PolicyModel,
  profile: DemographicProfile,
): PersonalImpact {
  const p = toEnginePersona(u, profile);
  const m = model;
  const align = personaAlignment(p, m);
  const employed = p.roles.includes("worker");
  const median = profile.medianIncome;

  const baseIncome = p.income;
  const baseHousing = p.monthlyHousingCost;
  const baseBurden = (baseHousing * 12) / Math.max(baseIncome, 1);

  let income = baseIncome;
  let housing = baseHousing;
  let rentCapped = false;
  let wageRaise = false;
  let prevMonths = 0;

  // Walk the same 4 horizons the engine uses, applying ONLY the deterministic
  // forces (drift + cap + wage floor + channel exposure). No RNG, no cascades.
  for (const round of ROUNDS) {
    const years = (round.monthsElapsed - prevMonths) / 12;
    const tf = TIME_PROFILES[m.timeProfile][round.index] ?? 1;

    // 1. baseline income drift
    income = Math.round(income * (1 + INCOME_GROWTH * years));

    // 2. housing drift — RENTERS only. Market rents move (capped under rent
    //    control); an owner's mortgage is effectively fixed, so we hold owner
    //    housing cost flat. This is the one place we diverge from the population
    //    engine (which drifts every agent uniformly) because it's more honest
    //    for an individual readout. Channel + alignment housing effects, like in
    //    the engine, also only touch renters.
    if (p.tenure === "renter") {
      let rentGrowth = m.marketRentGrowthPct ?? 0.05;
      rentGrowth -= m.channels.housing * 0.03 * m.intensity * tf;
      if (m.type === "rent_control") {
        const capped = Math.min(rentGrowth, m.rentCapPct ?? 0.03);
        if (capped < rentGrowth) rentCapped = true;
        rentGrowth = capped;
      }
      housing = Math.round(housing * (1 + rentGrowth * years));
      if (Math.abs(m.channels.housing) > 0.01) {
        housing = Math.round(housing * (1 - 0.08 * align * m.intensity * tf * Math.abs(m.channels.housing)));
      }
    }

    // 3. min-wage raise for low-wage workers (full-time hours assumed: no shock)
    if (m.type === "min_wage" && p.lowWage && employed) {
      const targetAnnual = (m.wageTarget ?? 20) * 2080;
      if (targetAnnual > income) {
        income = Math.round(income + (targetAnnual - income) * (0.5 + 0.5 * tf));
        wageRaise = true;
      }
    }

    // 4. generic income channel exposure scaled by alignment (housing channel
    //    is handled inside the renter block above).
    if (Math.abs(m.channels.income) > 0.01) {
      income = Math.round(income * (1 + 0.12 * align * m.intensity * tf * Math.abs(m.channels.income)));
    }

    prevMonths = round.monthsElapsed;
  }

  const afterBurden = clamp((housing * 12) / Math.max(income, 1), 0, 2);

  // Wellbeing + net welfare score: identical formulas to the engine's baseline
  // (align 0) vs finalize (align applied), minus the displacement/unemployment
  // penalties that only the stochastic simulation can produce.
  const wbBefore = computeWellbeing(p, median, m.intensity, baseBurden, employed, false, false, 0);
  const wbAfter = computeWellbeing(p, median, m.intensity, afterBurden, employed, false, false, align);

  let score = 0;
  score += (wbAfter - wbBefore) * 1.0;
  score += (baseBurden - afterBurden) * 120;
  score += (income / Math.max(baseIncome, 1) - 1) * 55;
  const impactScore = Math.round(clamp(score, -100, 100));

  let outcome: Outcome = "stable";
  if (impactScore > 8) outcome = "better";
  else if (impactScore < -8) outcome = "worse";

  // Why it lands this way: matched beneficiary / burdened keys. The "Other"
  // catch-all group is skipped — it's too low-signal to explain to a person.
  const reasons: PersonalReason[] = [];
  const seen = new Set<string>();
  for (const b of m.beneficiaries) {
    if (b.key !== "Other" && personaMatches(p, b.key) && !seen.has(`b:${b.key}`)) {
      seen.add(`b:${b.key}`);
      reasons.push({ kind: "benefit", key: b.key, label: reasonLabel(b.key, p.group), weight: b.weight });
    }
  }
  for (const c of m.burdened) {
    if (c.key !== "Other" && personaMatches(p, c.key) && !seen.has(`c:${c.key}`)) {
      seen.add(`c:${c.key}`);
      reasons.push({ kind: "burden", key: c.key, label: reasonLabel(c.key, p.group), weight: c.weight });
    }
  }
  reasons.sort((a, b) => b.weight - a.weight);

  // Channels that personally apply.
  const channels: PersonalChannel[] = (Object.entries(m.channels) as [Channel, number][])
    .filter(([ch, v]) => Math.abs(v) > 0.05 && channelRelevant(p, ch))
    .map(([ch, v]) => ({ channel: ch, value: v, label: CHANNEL_LABEL[ch] }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  // Risks: unintended consequences whose channel plausibly touches this persona.
  let risks: UnintendedConsequence[] = m.unintended
    .filter((u2) => channelRelevant(p, u2.channel))
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 4);
  if (risks.length === 0 && m.unintended.length > 0) {
    risks = [[...m.unintended].sort((a, b) => b.magnitude - a.magnitude)[0]];
  }

  const incomeAnnual = income - baseIncome;
  const housingAnnual = (housing - baseHousing) * 12;
  const netAnnual = incomeAnnual - housingAnnual;
  const rentBurdenPts = afterBurden - baseBurden;

  const { headline, summary } = describe({ outcome, netAnnual, reasons, rentCapped, wageRaise });

  return {
    outcome,
    impactScore,
    align,
    headline,
    summary,
    before: { income: baseIncome, monthlyHousingCost: baseHousing, rentBurden: baseBurden },
    after: { income, monthlyHousingCost: housing, rentBurden: afterBurden },
    deltas: { incomeAnnual, housingAnnual, rentBurdenPts, netAnnual },
    reasons,
    channels,
    risks,
  };
}

// --- plain-language narration -----------------------------------------------

function describe(args: {
  outcome: Outcome;
  netAnnual: number;
  reasons: PersonalReason[];
  rentCapped: boolean;
  wageRaise: boolean;
}): { headline: string; summary: string } {
  const { outcome, netAnnual, reasons, rentCapped, wageRaise } = args;
  const cash = Math.abs(netAnnual);
  // Only attach the cash figure when its sign agrees with the welfare verdict,
  // so the headline can't say "better off — $X against you" (the score folds in
  // rent-burden relief and wellbeing, which can diverge from raw cash flow).
  const cashAgrees = (outcome === "better" && netAnnual > 0) || (outcome === "worse" && netAnnual < 0);
  const cashPhrase =
    cash >= 200 && cashAgrees
      ? ` — about ${fmtUSD(cash)}/yr ${netAnnual >= 0 ? "in your favor" : "against you"}`
      : "";

  let headline: string;
  if (outcome === "better") headline = `This policy likely leaves you better off${cashPhrase}.`;
  else if (outcome === "worse") headline = `This policy likely leaves you worse off${cashPhrase}.`;
  else headline = "This policy barely moves the needle for you.";

  const top = reasons[0];
  const parts: string[] = [];
  if (top) {
    parts.push(
      top.kind === "benefit"
        ? `${top.label}, you're among the policy's intended beneficiaries.`
        : `${top.label}, you're among those who bear its cost.`,
    );
  }
  if (wageRaise) parts.push("Your pay would rise toward the new wage floor.");
  if (rentCapped) parts.push("Your rent increases would be capped below the market rate.");
  if (!top && parts.length === 0) {
    parts.push("Based on your profile, the direct effects on your household look modest.");
  }

  return { headline, summary: parts.join(" ") };
}
