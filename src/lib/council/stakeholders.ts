import type { AgentRecord, PolicyType } from "@/lib/types";
import type { Stakeholder, StakeholderId } from "./types";

// ============================================================================
// Stakeholder roster. Each seat carries a color used across the chamber, a
// one-line mandate that becomes the agent's Claude system prompt, and a
// predicate that maps the seat to the residents it represents — so every
// stance is grounded in that constituency's MEASURED outcome, not vibes.
// ============================================================================

interface StakeholderDef extends Stakeholder {
  // Which simulated residents this seat speaks for. The Chair has no
  // constituency predicate (it speaks for fairness across the whole panel).
  represents?: (a: AgentRecord) => boolean;
}

const DEFS: Record<StakeholderId, StakeholderDef> = {
  renter_advocate: {
    id: "renter_advocate",
    name: "Tenants Union",
    seat: "Renters & low-income tenants",
    color: "#34d399",
    mandate:
      "You fight displacement and rent burden for tenants, especially low-wage and immigrant renters. You will not accept a bill that pushes your constituents out of the city.",
    isChair: false,
    represents: (a) => a.persona.tenure === "renter",
  },
  landlord_coalition: {
    id: "landlord_coalition",
    name: "Property Owners Assoc.",
    seat: "Small landlords & housing providers",
    color: "#f59e0b",
    mandate:
      "You protect the viability of small landlords and the rental supply. You resist measures that make operating units unprofitable and shrink the housing stock.",
    isChair: false,
    represents: (a) => a.persona.roles.includes("small_landlord"),
  },
  small_business: {
    id: "small_business",
    name: "Small Business Alliance",
    seat: "Small-business owners",
    color: "#6e8bff",
    mandate:
      "You speak for small employers operating on thin margins. You support workers but resist cost shocks that force you to cut hours, raise prices, or close.",
    isChair: false,
    represents: (a) => a.persona.roles.includes("business_owner"),
  },
  labor: {
    id: "labor",
    name: "Labor Council",
    seat: "Workers & wage-earners",
    color: "#fb7185",
    mandate:
      "You fight for higher take-home pay, stable hours, and job security for working people. You weigh wage gains against any job or hours losses your members would absorb.",
    isChair: false,
    represents: (a) => a.persona.roles.includes("worker"),
  },
  budget_office: {
    id: "budget_office",
    name: "City Budget Office",
    seat: "Fiscal cost & public services",
    color: "#a78bfa",
    mandate:
      "You are the nonpartisan pragmatist. You care about overall stability, the cost to public services, and whether the bill is administrable. You favor durable compromises over maximalism.",
    isChair: false,
    represents: () => true, // city-wide proxy: fiscal exposure tracks the whole population
  },
  homeowner_assoc: {
    id: "homeowner_assoc",
    name: "Homeowners Assoc.",
    seat: "Homeowners & neighborhoods",
    color: "#22d3ee",
    mandate:
      "You represent homeowners. You protect property values and neighborhood character, and scrutinize density, tax, and zoning changes for their effect on owners.",
    isChair: false,
    represents: (a) => a.persona.tenure === "owner",
  },
  equity_chair: {
    id: "equity_chair",
    name: "Equity Commissioner",
    seat: "Chair · distributional fairness",
    color: "#e2e8f0",
    mandate:
      "You chair the council. You hold no seat-interest; you speak for distributional fairness. You frame the conflict in terms of who-gets-hurt and the inequality (Gini) shift, broker amendments, and call the vote. You do not cast a constituency vote.",
    isChair: true,
  },
};

export function stakeholder(id: StakeholderId): Stakeholder {
  const { represents: _omit, ...rest } = DEFS[id];
  void _omit;
  return rest;
}

/** Residents a seat speaks for (Chair → none). */
export function constituency(id: StakeholderId, agents: AgentRecord[]): AgentRecord[] {
  const pred = DEFS[id].represents;
  return pred ? agents.filter(pred) : [];
}

// ---------------------------------------------------------------------------
// Seat selection — choose the four most-affected seats for the policy type,
// always chaired by the Equity Commissioner. Mirrors how Ghost picks the
// agent roster from the generated world's domain.
// ---------------------------------------------------------------------------

const PANELS: Record<PolicyType, StakeholderId[]> = {
  rent_control: ["renter_advocate", "landlord_coalition", "budget_office", "small_business"],
  zoning: ["renter_advocate", "landlord_coalition", "homeowner_assoc", "budget_office"],
  min_wage: ["labor", "small_business", "budget_office", "renter_advocate"],
  tax: ["budget_office", "small_business", "labor", "homeowner_assoc"],
  healthcare: ["budget_office", "labor", "small_business", "renter_advocate"],
  immigration: ["labor", "small_business", "renter_advocate", "budget_office"],
  generic: ["renter_advocate", "small_business", "labor", "budget_office"],
};

export function selectPanel(policyType: PolicyType): Stakeholder[] {
  const seats = PANELS[policyType] ?? PANELS.generic;
  return [...seats, "equity_chair" as StakeholderId].map(stakeholder);
}

export function chairOf(panel: Stakeholder[]): Stakeholder {
  return panel.find((s) => s.isChair) ?? panel[panel.length - 1];
}

export function seatsOf(panel: Stakeholder[]): Stakeholder[] {
  return panel.filter((s) => !s.isChair);
}
