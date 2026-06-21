import type { AgentRecord, Analysis, DemographicProfile, PolicyModel } from "@/lib/types";
import { round2 } from "@/lib/utils";
import { constituency, seatsOf } from "./stakeholders";
import type { ConstituentOutcome, GroundingBrief, ImpactSnapshot, Stakeholder } from "./types";

// ============================================================================
// Grounding — turn a finished simulation run into the brief the council argues
// from. Every stakeholder gets its constituents' MEASURED outcome (mean welfare
// impact + displacement), so its opening stance is anchored to real numbers
// from PolicyPulse's engine, not invented.
// ============================================================================

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function displaced(a: AgentRecord): boolean {
  return a.current.displaced || a.current.leftJurisdiction;
}

/** Population-level outcome shares (mirror metrics.analyze's framing). */
export function snapshot(agents: AgentRecord[], giniAfter: number): ImpactSnapshot {
  const n = Math.max(agents.length, 1);
  return {
    displacementRate: round2(agents.filter(displaced).length / n),
    giniAfter,
    loseShare: round2(agents.filter((a) => a.outcome === "worse" || a.outcome === "displaced").length / n),
    winShare: round2(agents.filter((a) => a.outcome === "better").length / n),
  };
}

export function constituentOutcome(seat: Stakeholder, agents: AgentRecord[]): ConstituentOutcome {
  const members = constituency(seat.id, agents);
  const n = Math.max(members.length, 1);
  return {
    stakeholderId: seat.id,
    label: seat.seat,
    count: members.length,
    meanImpact: Math.round(mean(members.map((m) => m.impactScore))),
    displacementRate: round2(members.filter(displaced).length / n),
  };
}

export function buildBrief(input: {
  jurisdiction: string;
  profile: DemographicProfile;
  model: PolicyModel;
  analysis: Analysis;
  agents: AgentRecord[];
  panel: Stakeholder[];
}): GroundingBrief {
  const { jurisdiction, profile, model, analysis, agents, panel } = input;
  const snap = snapshot(agents, analysis.giniAfter);
  const outcomes = seatsOf(panel).map((s) => constituentOutcome(s, agents));

  return {
    jurisdiction,
    populationLabel: `${agents.length} residents · ${profile.grounded ? `grounded in ${profile.state} ACS` : "labeled dataset"}`,
    grounded: profile.grounded,
    policyTitle: model.title,
    policyType: model.type,
    headline: analysis.headline,
    summary: analysis.summary,
    giniBefore: analysis.giniBefore,
    giniAfter: analysis.giniAfter,
    displacementRate: snap.displacementRate,
    loseShare: snap.loseShare,
    winShare: snap.winShare,
    whoGetsHurt: analysis.whoGetsHurt,
    winners: analysis.winners,
    disparities: analysis.disparities,
    outcomes,
  };
}
