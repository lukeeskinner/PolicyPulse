import type {
  AgentRecord,
  AgentState,
  CascadeRecord,
  DemographicProfile,
  Outcome,
  Persona,
  PolicyModel,
  Role,
  RoundDef,
} from "./types";
import { clamp, RNG, rngInt } from "./utils";

// ============================================================================
// PolicyPulse simulation engine.
//
// Each synthetic resident lives through the policy across rounds (Month 1 ->
// Year 3). Every round layers three forces:
//   1. Counterfactual market drift (rents and incomes move regardless).
//   2. Direct policy effects (rent caps, wage floors, channel exposure).
//   3. Cascading second-order shocks: actor agents (landlords, businesses)
//      make decisions that displace tenants or cut workers' hours.
// The result is per-agent trajectories the inequality view dissects.
// ============================================================================

const INCOME_GROWTH = 0.03; // annual nominal income drift

export interface RoundUpdate {
  agentId: string;
  round: number;
  state: AgentState;
  decision: string;
  note: string;
}

export interface StepResult {
  updates: RoundUpdate[];
  cascades: CascadeRecord[];
  supplyIndex: number;
}

interface Shock {
  hoursLoss?: number;
  jobLoss?: boolean;
  displace?: boolean;
  reason?: string;
}

const TIME_PROFILES: Record<PolicyModel["timeProfile"], number[]> = {
  frontloaded: [0.55, 0.8, 0.92, 1],
  gradual: [0.2, 0.5, 0.78, 1],
  delayed: [0.05, 0.22, 0.5, 1],
};

export class SimulationEngine {
  agents: AgentRecord[];
  private byId: Map<string, AgentRecord>;
  supplyIndex = 100;
  private prevMonths = 0;

  constructor(
    public profile: DemographicProfile,
    public model: PolicyModel,
    personas: Persona[],
    private rng: RNG,
  ) {
    this.agents = personas.map((p) => this.initRecord(p));
    this.byId = new Map(this.agents.map((a) => [a.persona.id, a]));
  }

  private timeFactor(roundIndex: number): number {
    return TIME_PROFILES[this.model.timeProfile][roundIndex] ?? 1;
  }

  // --- alignment: an agent's net fortune under the policy (-1.2..1.2) --------
  private alignment(p: Persona): number {
    const has = (key: string) =>
      (p.roles as string[]).includes(key) ||
      key === p.group ||
      (key === "renter" && p.tenure === "renter") ||
      (key === "owner" && p.tenure === "owner");
    let a = 0;
    for (const b of this.model.beneficiaries) if (has(b.key)) a += b.weight;
    for (const c of this.model.burdened) if (has(c.key)) a -= c.weight;
    // low-income renters are disproportionately exposed to housing stress
    if (p.tenure === "renter" && p.lowWage) a += this.model.channels.stability * 0.2;
    return clamp(a, -1.2, 1.2);
  }

  private initRecord(p: Persona): AgentRecord {
    const rentBurden = (p.monthlyHousingCost * 12) / Math.max(p.income, 1);
    const employed = p.roles.includes("worker");
    const state: AgentState = {
      round: -1,
      income: p.income,
      monthlyHousingCost: p.monthlyHousingCost,
      rentBurden,
      employed,
      hours: employed ? 1 : 0,
      displaced: false,
      leftJurisdiction: false,
      wealth: p.savings,
      wellbeing: this.computeWellbeing(p, rentBurden, employed, false, false, 0),
      status: this.describeStatus(p, rentBurden, employed, false),
      flags: [],
    };
    return {
      persona: p,
      history: [{ round: -1, label: "Baseline", state, decision: "Lives in " + p.neighborhood, note: "Pre-policy baseline" }],
      current: { ...state },
      outcome: "stable",
      impactScore: 0,
    };
  }

  private computeWellbeing(
    p: Persona,
    rentBurden: number,
    employed: boolean,
    displaced: boolean,
    left: boolean,
    align: number,
  ): number {
    let wb = 72;
    wb -= clamp(rentBurden - 0.3, 0, 0.7) * 100;
    wb += p.income > this.profile.medianIncome ? 6 : -4;
    wb += p.tenure === "owner" ? 5 : 0;
    if (!employed && p.roles.includes("worker")) wb -= 22;
    if (displaced) wb -= 18;
    if (left) wb -= 10;
    if (p.lowWage) wb -= 3;
    wb += align * 5 * this.model.intensity;
    return Math.round(clamp(wb, 4, 97));
  }

  private describeStatus(p: Persona, rentBurden: number, employed: boolean, displaced: boolean): string {
    if (displaced) return "Displaced from " + p.neighborhood;
    if (!employed && p.roles.includes("worker")) return "Out of work in " + p.neighborhood;
    if (rentBurden > 0.5) return "Severely rent-burdened";
    if (rentBurden > 0.35) return "Rent-burdened";
    if (p.tenure === "owner") return "Stable homeowner";
    return "Stable renter";
  }

  private sample<T>(arr: T[], k: number): T[] {
    const pool = [...arr];
    const out: T[] = [];
    for (let i = 0; i < k && pool.length > 0; i++) {
      out.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    }
    return out;
  }

  private active(): AgentRecord[] {
    return this.agents.filter((a) => !a.current.leftJurisdiction);
  }

  // --------------------------------------------------------------------------
  step(round: RoundDef): StepResult {
    const years = (round.monthsElapsed - this.prevMonths) / 12;
    const tf = this.timeFactor(round.index);
    const cascades: CascadeRecord[] = [];
    const shocks = new Map<string, Shock>();

    // PASS A — actor decisions create cascades + shocks ----------------------
    for (const a of this.active()) {
      if (a.current.displaced) continue;
      const p = a.persona;

      if (this.model.type === "rent_control" && p.roles.includes("small_landlord")) {
        const prob = (this.model.supplyElasticity ?? 0.5) * this.model.intensity * 0.32 * (0.5 + tf);
        if (this.rng() < prob) {
          a.current.flags = ["landlord_exit"];
          const tenants = this.active().filter(
            (t) =>
              !t.current.displaced &&
              t.persona.tenure === "renter" &&
              t.persona.neighborhood === p.neighborhood &&
              t.persona.id !== p.id,
          );
          const victims = this.sample(tenants, rngInt(this.rng, 1, 2));
          for (const v of victims) {
            shocks.set(v.persona.id, { displace: this.rng() < 0.7, reason: "non-renewal after building sale" });
          }
          this.supplyIndex = clamp(this.supplyIndex - 100 / Math.max(this.agents.length, 1) * 2.4, 60, 100);
          cascades.push({
            round: round.index,
            kind: "landlord_exit",
            description: `${p.name} sold/converted a rental in ${p.neighborhood} → ${victims.length} tenant${victims.length === 1 ? "" : "s"} face non-renewal`,
            fromId: p.id,
            toIds: victims.map((v) => v.persona.id),
          });
        }
      }

      if (this.model.type === "min_wage" && p.roles.includes("business_owner")) {
        const prob = this.model.intensity * 0.18 * (0.5 + tf);
        if (this.rng() < prob) {
          const closed = this.rng() < 0.3;
          a.current.flags = [closed ? "business_closed" : "hours_cut_owner"];
          const workers = this.active().filter(
            (w) =>
              w.persona.sector === p.sector &&
              w.persona.lowWage &&
              !w.current.displaced &&
              w.current.employed &&
              w.persona.id !== p.id,
          );
          const victims = this.sample(workers, closed ? rngInt(this.rng, 1, 3) : rngInt(this.rng, 1, 2));
          for (const v of victims) {
            shocks.set(v.persona.id, {
              hoursLoss: closed ? 0.45 : 0.22,
              jobLoss: closed && this.rng() < 0.45,
              reason: closed ? `${p.sector} employer closed` : `${p.sector} employer cut hours`,
            });
          }
          cascades.push({
            round: round.index,
            kind: closed ? "business_closed" : "hours_cut",
            description: `${p.name}'s ${p.sector.toLowerCase()} business ${closed ? "closed" : "cut hours"} → ${victims.length} worker${victims.length === 1 ? "" : "s"} ${closed ? "lost a job" : "lost hours"}`,
            fromId: p.id,
            toIds: victims.map((v) => v.persona.id),
          });
        }
      }
    }

    // PASS B — apply drift + policy + shocks to every agent ------------------
    const updates: RoundUpdate[] = [];
    for (const a of this.agents) {
      const { decision, note } = this.updateAgent(a, round, years, tf, shocks.get(a.persona.id));
      updates.push({ agentId: a.persona.id, round: round.index, state: { ...a.current }, decision, note });
    }

    // zoning / supply-positive policies slowly add supply
    if (this.model.channels.housing > 0 && this.model.type !== "rent_control") {
      this.supplyIndex = clamp(this.supplyIndex + this.model.channels.housing * this.model.intensity * tf * 6, 100, 130);
    }

    this.prevMonths = round.monthsElapsed;
    return { updates, cascades, supplyIndex: this.supplyIndex };
  }

  private updateAgent(
    a: AgentRecord,
    round: RoundDef,
    years: number,
    tf: number,
    shock?: Shock,
  ): { decision: string; note: string } {
    const p = a.persona;
    const s: AgentState = { ...a.current, round: round.index, flags: [] };

    if (s.leftJurisdiction) {
      a.history.push({ round: round.index, label: round.label, state: { ...s }, decision: "No longer in the city", note: "Left the jurisdiction" });
      a.current = s;
      return { decision: "Gone", note: "Left the jurisdiction" };
    }

    const align = this.alignment(p);
    const m = this.model;
    const flags: string[] = [];

    // 1. baseline income drift
    s.income = Math.round(s.income * (1 + INCOME_GROWTH * years));

    // 2. housing drift (with rent cap for covered renters)
    let rentGrowth = m.marketRentGrowthPct ?? 0.05;
    rentGrowth -= m.channels.housing * 0.03 * m.intensity * tf; // supply-positive policies slow growth
    if (m.type === "rent_control" && p.tenure === "renter" && !s.displaced) {
      const capped = Math.min(rentGrowth, m.rentCapPct ?? 0.03);
      if (capped < rentGrowth) flags.push("rent_capped");
      rentGrowth = capped;
    }
    s.monthlyHousingCost = Math.round(s.monthlyHousingCost * (1 + rentGrowth * years));

    // 3. min-wage raise for low-wage workers
    if (m.type === "min_wage" && p.lowWage && s.employed) {
      const targetAnnual = (m.wageTarget ?? 20) * 2080 * s.hours;
      if (targetAnnual > s.income) {
        s.income = Math.round(s.income + (targetAnnual - s.income) * (0.5 + 0.5 * tf));
        flags.push("wage_raise");
      }
    }

    // 4. generic channel exposure scaled by alignment
    if (Math.abs(m.channels.income) > 0.01) {
      s.income = Math.round(s.income * (1 + 0.12 * align * m.intensity * tf * Math.abs(m.channels.income)));
    }
    if (Math.abs(m.channels.housing) > 0.01 && p.tenure === "renter") {
      s.monthlyHousingCost = Math.round(s.monthlyHousingCost * (1 - 0.08 * align * m.intensity * tf * Math.abs(m.channels.housing)));
    }
    if (Math.abs(m.channels.wealth) > 0.01) {
      s.wealth = Math.round(Math.max(0, s.wealth * (1 + 0.15 * align * m.intensity * tf * Math.abs(m.channels.wealth))));
    }

    // 5. cascade shocks
    if (shock?.jobLoss) {
      s.employed = false;
      s.hours = 0;
      s.income = Math.round(Math.max(s.income * 0.32, 14000));
      flags.push("job_loss");
    } else if (shock?.hoursLoss) {
      s.hours = clamp(s.hours - shock.hoursLoss, 0.2, 1);
      s.income = Math.round(s.income * (1 - shock.hoursLoss * 0.85));
      flags.push("hours_cut");
    }
    if (shock?.displace && !s.displaced) {
      s.displaced = true;
      flags.push("displaced");
      const leaves = this.rng() < 0.45 || s.income < this.profile.medianIncome * 0.4;
      if (leaves) {
        s.leftJurisdiction = true;
        flags.push("left_city");
      } else {
        s.monthlyHousingCost = Math.round(s.monthlyHousingCost * 1.12);
      }
    }

    // small landlords losing rental income under rent control
    if (m.type === "rent_control" && p.roles.includes("small_landlord")) {
      s.wealth = Math.round(Math.max(0, s.wealth * (1 - 0.05 * m.intensity * tf)));
      if (!flags.includes("landlord_exit")) flags.push("margin_squeeze");
    }

    // 6. recompute derived metrics
    s.rentBurden = clamp((s.monthlyHousingCost * 12) / Math.max(s.income, 1), 0, 2);
    s.wellbeing = this.computeWellbeing(p, s.rentBurden, s.employed, s.displaced, s.leftJurisdiction, align);
    s.status = this.describeStatus(p, s.rentBurden, s.employed, s.displaced);
    s.flags = flags;

    const { decision, note } = this.describeRound(a, s, flags, align);
    a.history.push({ round: round.index, label: round.label, state: { ...s }, decision, note });
    a.current = s;
    return { decision, note };
  }

  private describeRound(a: AgentRecord, s: AgentState, flags: string[], align: number): { decision: string; note: string } {
    const p = a.persona;
    if (flags.includes("left_city")) return { decision: "Left the city", note: `Priced out of ${p.neighborhood}; relocated out of the jurisdiction.` };
    if (flags.includes("displaced")) return { decision: "Forced to move", note: `Lost the unit in ${p.neighborhood} and moved to a costlier, farther home.` };
    if (flags.includes("job_loss")) return { decision: "Lost the job", note: `Employer cut staff; now relying on reduced income.` };
    if (flags.includes("hours_cut")) return { decision: "Hours reduced", note: `Scheduled hours cut to ${Math.round(s.hours * 100)}% of full-time.` };
    if (flags.includes("business_closed")) return { decision: "Closed the business", note: `Margins collapsed under higher costs; shut the doors.` };
    if (flags.includes("landlord_exit")) return { decision: "Sold the rental", note: `Converted/sold the unit as returns fell below target.` };
    if (flags.includes("wage_raise")) return { decision: "Took the raise", note: `Hourly pay rose toward the new floor; income up to ~${s.income.toLocaleString()}.` };
    if (flags.includes("rent_capped")) return { decision: "Stayed put", note: `Rent increase capped — kept the home in ${p.neighborhood}.` };
    if (flags.includes("margin_squeeze")) return { decision: "Held on, thinner margins", note: `Kept renting out the unit despite squeezed returns.` };
    if (align > 0.3) return { decision: "Slightly better off", note: `Modest gains from the policy this period.` };
    if (align < -0.3) return { decision: "Slightly worse off", note: `Absorbed some added cost from the policy.` };
    return { decision: "Held steady", note: `No major change this period.` };
  }

  // --------------------------------------------------------------------------
  finalize(): AgentRecord[] {
    for (const a of this.agents) {
      const base = a.history[0].state;
      const cur = a.current;
      let score = 0;
      score += (cur.wellbeing - base.wellbeing) * 1.0;
      score += (base.rentBurden - cur.rentBurden) * 120;
      score += (cur.income / Math.max(base.income, 1) - 1) * 55;
      if (cur.displaced) score -= 35;
      if (cur.leftJurisdiction) score -= 25;
      if (!cur.employed && a.persona.roles.includes("worker")) score -= 30;
      a.impactScore = Math.round(clamp(score, -100, 100));
      let outcome: Outcome = "stable";
      if (cur.displaced || cur.leftJurisdiction) outcome = "displaced";
      else if (a.impactScore > 8) outcome = "better";
      else if (a.impactScore < -8) outcome = "worse";
      a.outcome = outcome;
    }
    return this.agents;
  }
}

export function roleLabel(roles: Role[]): string {
  if (roles.includes("small_landlord")) return "Small landlord";
  if (roles.includes("business_owner")) return "Business owner";
  if (roles.includes("retiree")) return "Retiree";
  if (roles.includes("student")) return "Student";
  if (roles.includes("worker")) return "Worker";
  return roles[0] ?? "Resident";
}
