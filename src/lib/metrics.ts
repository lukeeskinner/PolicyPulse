import type {
  AgentRecord,
  Analysis,
  DemographicProfile,
  Disparity,
  GroupMetric,
  PolicyModel,
  RoundDef,
  RoundMetrics,
  SegmentImpact,
  UnintendedConsequence,
} from "./types";
import { clamp, fmtPct, gini, round2 } from "./utils";

// ============================================================================
// Aggregation + inequality analysis.
// ============================================================================

function present(agents: AgentRecord[]): AgentRecord[] {
  return agents.filter((a) => !a.current.leftJurisdiction);
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : 0;
}

function groupMetric(group: string, agents: AgentRecord[]): GroupMetric {
  const all = agents.filter((a) => a.persona.group === group);
  const here = all.filter((a) => !a.current.leftJurisdiction);
  const workers = here.filter((a) => a.persona.roles.includes("worker"));
  return {
    group,
    count: all.length,
    avgRentBurden: round2(avg(here.map((a) => a.current.rentBurden))),
    displacementRate: all.length
      ? round2(all.filter((a) => a.current.displaced || a.current.leftJurisdiction).length / all.length)
      : 0,
    employmentRate: workers.length
      ? round2(workers.filter((a) => a.current.employed).length / workers.length)
      : 1,
    avgWellbeing: Math.round(avg(here.map((a) => a.current.wellbeing))),
    avgIncome: Math.round(avg(here.map((a) => a.current.income))),
    impactScore: Math.round(avg(all.map((a) => a.impactScore))),
  };
}

export function computeRoundMetrics(
  agents: AgentRecord[],
  profile: DemographicProfile,
  round: RoundDef,
  supplyIndex: number,
  baselineAvgBurden: number,
): RoundMetrics {
  const here = present(agents);
  const workers = here.filter((a) => a.persona.roles.includes("worker"));
  const avgBurden = avg(here.map((a) => a.current.rentBurden));
  const groups = Object.keys(profile.groups).filter((g) =>
    agents.some((a) => a.persona.group === g),
  );
  return {
    round: round.index,
    label: round.label,
    avgRentBurden: round2(avgBurden),
    displacementRate: round2(
      agents.filter((a) => a.current.displaced || a.current.leftJurisdiction).length /
        Math.max(agents.length, 1),
    ),
    employmentRate: workers.length
      ? round2(workers.filter((a) => a.current.employed).length / workers.length)
      : 1,
    avgWellbeing: Math.round(avg(here.map((a) => a.current.wellbeing))),
    housingSupplyIndex: Math.round(supplyIndex),
    affordabilityIndex: Math.round(100 * (baselineAvgBurden / Math.max(avgBurden, 0.01))),
    byGroup: groups.map((g) => groupMetric(g, agents)),
  };
}

// ---------------------------------------------------------------------------
// Segmentation for "who gets hurt / winners"
// ---------------------------------------------------------------------------

function incomeTier(income: number, median: number): string {
  if (income < median * 0.6) return "Low-income";
  if (income > median * 1.4) return "High-income";
  return "Middle-income";
}

function tenureLabel(a: AgentRecord): string {
  if (a.persona.roles.includes("small_landlord")) return "landlords";
  if (a.persona.roles.includes("business_owner")) return "business owners";
  return a.persona.tenure === "renter" ? "renters" : "homeowners";
}

function segmentKey(a: AgentRecord, median: number): string {
  return `${incomeTier(a.persona.income, median)} ${a.persona.group} ${tenureLabel(a)}`;
}

function buildSegments(agents: AgentRecord[], median: number): SegmentImpact[] {
  const groups = new Map<string, AgentRecord[]>();
  for (const a of agents) {
    const key = segmentKey(a, median);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  const segs: SegmentImpact[] = [];
  for (const [segment, members] of groups) {
    if (members.length < 2) continue;
    const impactScore = Math.round(avg(members.map((m) => m.impactScore)));
    const displaced = members.filter((m) => m.current.displaced || m.current.leftJurisdiction).length;
    const sample = [...members].sort((a, b) => a.impactScore - b.impactScore)[0];
    segs.push({
      segment,
      impactScore,
      count: members.length,
      displacementRate: round2(displaced / members.length),
      sampleAgentId: sample.persona.id,
      story: "",
    });
  }
  return segs;
}

function buildRoleCohorts(agents: AgentRecord[]): SegmentImpact[] {
  const cohorts: { label: string; pred: (a: AgentRecord) => boolean }[] = [
    { label: "Small landlords", pred: (a) => a.persona.roles.includes("small_landlord") },
    { label: "Small-business owners", pred: (a) => a.persona.roles.includes("business_owner") },
    { label: "Low-wage renters", pred: (a) => a.persona.lowWage && a.persona.tenure === "renter" },
    { label: "Immigrant households", pred: (a) => a.persona.nativity === "immigrant" },
    { label: "Homeowners", pred: (a) => a.persona.tenure === "owner" },
  ];
  const segs: SegmentImpact[] = [];
  for (const c of cohorts) {
    const members = agents.filter(c.pred);
    if (members.length < 2) continue;
    const displaced = members.filter((m) => m.current.displaced || m.current.leftJurisdiction).length;
    const sample = [...members].sort((a, b) => a.impactScore - b.impactScore)[0];
    segs.push({
      segment: c.label,
      impactScore: Math.round(avg(members.map((m) => m.impactScore))),
      count: members.length,
      displacementRate: round2(displaced / members.length),
      sampleAgentId: sample.persona.id,
      story: "",
    });
  }
  return segs;
}

function storyFor(seg: SegmentImpact, hurt: boolean): string {
  const disp = seg.displacementRate > 0 ? ` ${fmtPct(seg.displacementRate)} were displaced or left the city.` : "";
  if (hurt) {
    return `${seg.count} ${seg.segment.toLowerCase()} bore a net welfare loss (impact ${seg.impactScore}).${disp}`;
  }
  return `${seg.count} ${seg.segment.toLowerCase()} came out ahead (impact +${seg.impactScore}).`;
}

// ---------------------------------------------------------------------------
// Disparities
// ---------------------------------------------------------------------------

function buildDisparities(byGroup: GroupMetric[]): Disparity[] {
  const out: Disparity[] = [];
  const sized = byGroup.filter((g) => g.count >= 3);
  if (sized.length >= 2) {
    // displacement disparity
    const byDisp = [...sized].sort((a, b) => b.displacementRate - a.displacementRate);
    const hi = byDisp[0];
    const lo = byDisp[byDisp.length - 1];
    if (hi.displacementRate > 0) {
      const ratio = lo.displacementRate > 0 ? hi.displacementRate / lo.displacementRate : hi.displacementRate / 0.01;
      out.push({
        metric: "Displacement rate",
        advantaged: lo.group,
        disadvantaged: hi.group,
        ratio: round2(Math.min(ratio, 20)),
        statement: `${hi.group} residents were displaced at ${fmtPct(hi.displacementRate)} — ${ratio >= 2 ? `${round2(Math.min(ratio, 20))}x` : "more than"} the rate of ${lo.group} residents (${fmtPct(lo.displacementRate)}).`,
      });
    }
    // impact disparity
    const byImpact = [...sized].sort((a, b) => a.impactScore - b.impactScore);
    const worst = byImpact[0];
    const best = byImpact[byImpact.length - 1];
    if (best.impactScore - worst.impactScore >= 10) {
      out.push({
        metric: "Net welfare impact",
        advantaged: best.group,
        disadvantaged: worst.group,
        ratio: round2(best.impactScore - worst.impactScore),
        statement: `${best.group} residents netted a +${best.impactScore} welfare impact while ${worst.group} residents saw ${worst.impactScore} — a ${best.impactScore - worst.impactScore}-point gap.`,
      });
    }
    // rent burden disparity
    const byBurden = [...sized].sort((a, b) => b.avgRentBurden - a.avgRentBurden);
    const hb = byBurden[0];
    const lb = byBurden[byBurden.length - 1];
    if (hb.avgRentBurden - lb.avgRentBurden >= 0.08) {
      out.push({
        metric: "Rent burden",
        advantaged: lb.group,
        disadvantaged: hb.group,
        ratio: round2(hb.avgRentBurden / Math.max(lb.avgRentBurden, 0.01)),
        statement: `${hb.group} households end with ${fmtPct(hb.avgRentBurden)} of income going to housing vs ${fmtPct(lb.avgRentBurden)} for ${lb.group}.`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Materialized unintended consequences (observed in the run)
// ---------------------------------------------------------------------------

function observedUnintended(
  agents: AgentRecord[],
  model: PolicyModel,
  finalSupplyIndex: number,
): UnintendedConsequence[] {
  const out: UnintendedConsequence[] = [];
  const left = agents.filter((a) => a.current.leftJurisdiction).length;
  const displaced = agents.filter((a) => a.current.displaced).length;
  const jobless = agents.filter((a) => a.persona.roles.includes("worker") && !a.current.employed).length;
  const landlordExits = agents.filter((a) => a.persona.roles.includes("small_landlord") && a.history.some((h) => h.state.flags.includes("landlord_exit"))).length;

  if (finalSupplyIndex < 99) {
    out.push({
      flag: "Rental supply contracted",
      statement: `The rental stock fell to ${finalSupplyIndex}% of baseline as ${landlordExits} small landlord${landlordExits === 1 ? "" : "s"} exited the market.`,
      magnitude: clamp((100 - finalSupplyIndex) / 40, 0.2, 1),
      channel: "housing",
    });
  }
  if (displaced + left > 0) {
    out.push({
      flag: "Displacement",
      statement: `${displaced + left} resident${displaced + left === 1 ? "" : "s"} were displaced${left > 0 ? `, ${left} forced out of the city entirely` : ""}.`,
      magnitude: clamp((displaced + left) / Math.max(agents.length, 1) * 4, 0.2, 1),
      channel: "stability",
    });
  }
  if (jobless > 0) {
    out.push({
      flag: "Job & hours losses",
      statement: `${jobless} worker${jobless === 1 ? "" : "s"} lost their job as employers adjusted to the policy.`,
      magnitude: clamp(jobless / Math.max(agents.length, 1) * 4, 0.2, 1),
      channel: "employment",
    });
  }
  // include modeled risks that are qualitative
  for (const u of model.unintended) {
    if (!out.some((o) => o.flag === u.flag)) out.push(u);
  }
  return out.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Top-level analysis
// ---------------------------------------------------------------------------

export function analyze(
  agents: AgentRecord[],
  profile: DemographicProfile,
  model: PolicyModel,
  finalSupplyIndex: number,
): Analysis {
  const median = profile.medianIncome;
  const netResources = (a: AgentRecord, baseline: boolean) => {
    const st = baseline ? a.history[0].state : a.current;
    return Math.max(0, st.income - st.monthlyHousingCost * 12);
  };
  const giniBefore = round2(gini(agents.map((a) => netResources(a, true))));
  const giniAfter = round2(gini(agents.map((a) => netResources(a, false))));

  const byGroup = Object.keys(profile.groups)
    .filter((g) => agents.some((a) => a.persona.group === g))
    .map((g) => groupMetric(g, agents));

  const disparities = buildDisparities(byGroup);
  const unintended = observedUnintended(agents, model, finalSupplyIndex);

  const pool = [...buildSegments(agents, median), ...buildRoleCohorts(agents)];
  const dedupe = (segs: SegmentImpact[]) => {
    const seen = new Set<string>();
    return segs.filter((s) => (seen.has(s.segment) ? false : (seen.add(s.segment), true)));
  };
  const whoGetsHurt = dedupe(
    [...pool].filter((s) => s.impactScore < 0).sort((a, b) => a.impactScore - b.impactScore),
  )
    .slice(0, 4)
    .map((s) => ({ ...s, story: storyFor(s, true) }));
  const winners = dedupe(
    [...pool].filter((s) => s.impactScore > 0).sort((a, b) => b.impactScore - a.impactScore),
  )
    .slice(0, 3)
    .map((s) => ({ ...s, story: storyFor(s, false) }));

  const displaced = agents.filter((a) => a.current.displaced || a.current.leftJurisdiction).length;
  const winShare = agents.filter((a) => a.outcome === "better").length / Math.max(agents.length, 1);
  const loseShare = agents.filter((a) => a.outcome === "worse" || a.outcome === "displaced").length / Math.max(agents.length, 1);

  const headline =
    disparities[0]?.statement ??
    (winShare > loseShare
      ? `Most residents came out ahead, but ${fmtPct(loseShare)} were left worse off.`
      : `${fmtPct(loseShare)} of residents ended up worse off under this policy.`);

  const giniMove = giniAfter > giniBefore ? "widened" : "narrowed";
  const summary =
    `${model.title}: ${fmtPct(winShare)} of residents benefited and ${fmtPct(loseShare)} were hurt; ${displaced} were displaced. ` +
    `Net-resource inequality (Gini) ${giniMove} from ${giniBefore} to ${giniAfter}. ` +
    (whoGetsHurt[0] ? `The hardest-hit group: ${whoGetsHurt[0].segment.toLowerCase()}.` : "");

  return {
    headline,
    summary,
    giniBefore,
    giniAfter,
    disparities,
    unintended,
    whoGetsHurt,
    winners,
    byGroup,
  };
}
