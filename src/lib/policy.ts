import type { Channel, PolicyModel, PolicyType, UnintendedConsequence } from "./types";
import { clamp } from "./utils";

// ============================================================================
// Heuristic policy parser.
//
// Classifies a free-text policy / bill into a structured PolicyModel that the
// simulation engine can run. The Mastra PolicyAnalyst agent produces the exact
// same shape when ANTHROPIC_API_KEY is configured; this is the offline brain.
// ============================================================================

const ZERO_CHANNELS: Record<Channel, number> = {
  income: 0,
  housing: 0,
  employment: 0,
  wealth: 0,
  stability: 0,
};

function channels(p: Partial<Record<Channel, number>>): Record<Channel, number> {
  return { ...ZERO_CHANNELS, ...p };
}

/** Pull the first percentage in text, e.g. "3%" -> 0.03. */
function extractPct(text: string): number | undefined {
  const m = text.match(/(\d+(?:\.\d+)?)\s?%/);
  return m ? parseFloat(m[1]) / 100 : undefined;
}

/** Pull the first dollar amount, e.g. "$20" or "$20.50" -> 20.5. */
function extractDollars(text: string): number | undefined {
  const m = text.match(/\$\s?(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : undefined;
}

function classify(text: string): PolicyType {
  const t = text.toLowerCase();
  if (/rent control|rent cap|rent stabil|rent increase|rent freeze|just cause/.test(t))
    return "rent_control";
  if (/minimum wage|min wage|wage floor|\$\d+\s?(?:\/|per|an)\s?hour|hourly wage/.test(t))
    return "min_wage";
  if (/zoning|upzon|rezon|density|single-family|adu|accessory dwelling|setback|height limit/.test(t))
    return "zoning";
  if (/\btax\b|levy|surcharge|vacancy tax|property tax|income tax|capital gains/.test(t))
    return "tax";
  if (/health|medicaid|medicare|insurance|single.?payer|premium|copay/.test(t))
    return "healthcare";
  if (/immigrat|sanctuary|deport|visa|undocument|asylum|border/.test(t))
    return "immigration";
  return "generic";
}

function deriveTitle(raw: string): string {
  const firstLine = raw.trim().split(/[.\n]/)[0].trim();
  if (firstLine.length <= 90) return firstLine;
  return firstLine.slice(0, 87) + "…";
}

export function heuristicPolicyModel(raw: string, jurisdiction: string): PolicyModel {
  const type = classify(raw);
  const title = deriveTitle(raw) || "Untitled policy";
  const t = raw.toLowerCase();

  const base: PolicyModel = {
    type,
    title,
    summary: "",
    mechanism: "",
    raw,
    intensity: 0.6,
    timeProfile: "gradual",
    channels: channels({}),
    beneficiaries: [],
    burdened: [],
    unintended: [],
    confidence: 0.5,
    modelSource: "heuristic",
  };

  switch (type) {
    case "rent_control": {
      const cap = extractPct(t) ?? 0.03;
      base.summary = `Caps annual rent increases near ${(cap * 100).toFixed(0)}% in ${jurisdiction}, limiting how fast landlords can raise rent on existing tenants.`;
      base.mechanism = "Binds rent growth below the market rate for covered units; protects incumbent tenants but compresses landlord margins and the incentive to supply rentals.";
      base.rentCapPct = cap;
      base.marketRentGrowthPct = 0.07;
      base.supplyElasticity = clamp(0.55 + (0.05 - cap) * 2, 0.3, 0.85);
      base.intensity = clamp(0.5 + (0.06 - cap) * 4, 0.4, 0.9);
      base.timeProfile = "gradual";
      base.channels = channels({ housing: 0.6, stability: 0.7, wealth: -0.4 });
      base.beneficiaries = [
        { key: "renter", weight: 0.8 },
        { key: "worker", weight: 0.3 },
      ];
      base.burdened = [
        { key: "small_landlord", weight: 0.9 },
        { key: "owner", weight: 0.2 },
      ];
      base.unintended = rentControlUnintended();
      base.confidence = 0.7;
      break;
    }
    case "min_wage": {
      const wage = extractDollars(t) ?? 20;
      base.summary = `Raises the local minimum wage to about $${wage.toFixed(0)}/hour in ${jurisdiction}, lifting pay for hourly workers while raising labor costs for employers.`;
      base.mechanism = "Lifts the wage floor: low-wage workers who keep their hours earn more, but some employers cut hours, slow hiring, or raise prices in response.";
      base.wageTarget = wage;
      base.intensity = clamp((wage - 15) / 12 + 0.4, 0.35, 0.95);
      base.supplyElasticity = 0.45;
      base.timeProfile = "frontloaded";
      base.channels = channels({ income: 0.7, employment: -0.35, housing: 0.1 });
      base.beneficiaries = [{ key: "worker", weight: 0.8 }];
      base.burdened = [
        { key: "business_owner", weight: 0.85 },
        { key: "worker", weight: -0.3 },
      ];
      base.unintended = minWageUnintended();
      base.confidence = 0.68;
      break;
    }
    case "zoning": {
      base.summary = `Changes land-use rules in ${jurisdiction} to allow more housing density, gradually expanding supply but reshaping established neighborhoods.`;
      base.mechanism = "Relaxes density limits so more units can be built over time; eases long-run affordability but invites speculation and near-term displacement around upzoned corridors.";
      base.intensity = 0.55;
      base.supplyElasticity = 0.6;
      base.timeProfile = "delayed";
      base.channels = channels({ housing: 0.4, wealth: 0.2, stability: -0.2 });
      base.beneficiaries = [
        { key: "renter", weight: 0.5 },
        { key: "business_owner", weight: 0.3 },
      ];
      base.burdened = [{ key: "owner", weight: 0.3 }];
      base.unintended = [
        {
          flag: "Speculative land buying",
          statement: "Investors buy up parcels along upzoned corridors, displacing existing low-rent tenants before new units arrive.",
          magnitude: 0.55,
          channel: "stability",
        },
        {
          flag: "Front-loaded demolition",
          statement: "Older naturally-affordable units are demolished years before replacement supply comes online.",
          magnitude: 0.45,
          channel: "housing",
        },
      ];
      base.confidence = 0.55;
      break;
    }
    case "tax": {
      const isVacancy = /vacancy/.test(t);
      base.summary = `Introduces a new tax/levy in ${jurisdiction}, shifting costs across households and businesses depending on who is liable.`;
      base.mechanism = isVacancy
        ? "Penalizes vacant units to push them onto the market; can expand supply but is passed through to some tenants and small owners."
        : "Raises revenue by taxing income, property, or transactions; incidence depends on which households and businesses are liable.";
      base.intensity = 0.5;
      base.timeProfile = "gradual";
      base.channels = isVacancy
        ? channels({ housing: 0.3, wealth: -0.3 })
        : channels({ income: -0.2, wealth: -0.3 });
      base.beneficiaries = [{ key: "renter", weight: 0.3 }];
      base.burdened = [
        { key: "owner", weight: 0.5 },
        { key: "small_landlord", weight: 0.4 },
        { key: "business_owner", weight: 0.4 },
      ];
      base.unintended = [
        {
          flag: "Cost pass-through",
          statement: "Part of the new tax is passed through to renters and customers rather than absorbed by owners.",
          magnitude: 0.5,
          channel: "income",
        },
      ];
      base.confidence = 0.5;
      break;
    }
    case "healthcare": {
      base.summary = `Expands health coverage / lowers care costs in ${jurisdiction}, improving stability for lower-income households while shifting costs.`;
      base.mechanism = "Reduces out-of-pocket medical costs and improves coverage, freeing income for housing and essentials; financed by taxes or premiums.";
      base.intensity = 0.55;
      base.timeProfile = "gradual";
      base.channels = channels({ income: 0.3, stability: 0.5, wealth: 0.2 });
      base.beneficiaries = [
        { key: "worker", weight: 0.6 },
        { key: "retiree", weight: 0.5 },
      ];
      base.burdened = [
        { key: "business_owner", weight: 0.4 },
        { key: "owner", weight: 0.2 },
      ];
      base.unintended = [
        {
          flag: "Employer hour adjustments",
          statement: "Some employers trim hours to stay under coverage thresholds, clipping take-home pay for part-time workers.",
          magnitude: 0.4,
          channel: "employment",
        },
      ];
      base.confidence = 0.5;
      break;
    }
    case "immigration": {
      base.summary = `Changes immigration enforcement / status rules affecting ${jurisdiction}, with sharp effects on immigrant households and labor-intensive sectors.`;
      base.mechanism = "Alters legal status, work authorization, or enforcement risk; reshapes labor supply in food, construction, and care sectors and household stability for immigrant families.";
      base.intensity = 0.6;
      base.timeProfile = "frontloaded";
      base.channels = channels({ income: -0.2, employment: -0.3, stability: -0.4 });
      base.beneficiaries = [{ key: "worker", weight: 0.2 }];
      base.burdened = [{ key: "worker", weight: 0.5 }];
      base.unintended = [
        {
          flag: "Labor supply shock",
          statement: "Sudden labor withdrawal in food, care, and construction raises costs and cuts hours for remaining workers.",
          magnitude: 0.5,
          channel: "employment",
        },
      ];
      base.confidence = 0.45;
      break;
    }
    default: {
      base.summary = `A policy affecting ${jurisdiction}. Modeled generically across income, housing, employment, and wealth channels.`;
      base.mechanism = "Generic policy model: distributes benefits and costs across roles and income groups based on detected language.";
      base.intensity = 0.5;
      base.timeProfile = "gradual";
      base.channels = channels({ income: 0.1, stability: 0.1, wealth: -0.1 });
      base.beneficiaries = [{ key: "worker", weight: 0.4 }];
      base.burdened = [{ key: "business_owner", weight: 0.3 }];
      base.unintended = [
        {
          flag: "Uneven incidence",
          statement: "Benefits concentrate among households with more resources to act on them, while costs fall on the least flexible.",
          magnitude: 0.4,
          channel: "wealth",
        },
      ];
      base.confidence = 0.4;
    }
  }

  return base;
}

function rentControlUnintended(): UnintendedConsequence[] {
  return [
    {
      flag: "Rental supply contraction",
      statement: "Small landlords convert covered units to condos or short-term rentals, shrinking the long-term rental stock.",
      magnitude: 0.65,
      channel: "housing",
    },
    {
      flag: "Deferred maintenance",
      statement: "Margin-squeezed owners defer repairs, degrading habitability in older buildings.",
      magnitude: 0.4,
      channel: "stability",
    },
    {
      flag: "Corporate consolidation",
      statement: "Mom-and-pop owners sell to corporate buyers who litigate evictions and chase vacancy decontrol.",
      magnitude: 0.5,
      channel: "wealth",
    },
  ];
}

function minWageUnintended(): UnintendedConsequence[] {
  return [
    {
      flag: "Hours reductions",
      statement: "Employers cut scheduled hours so weekly take-home pay barely moves for many workers.",
      magnitude: 0.55,
      channel: "employment",
    },
    {
      flag: "Price pass-through",
      statement: "Local businesses raise prices, eroding part of the real wage gain for the same workers.",
      magnitude: 0.4,
      channel: "income",
    },
    {
      flag: "Small-business closures",
      statement: "Thin-margin independents close or automate, concentrating jobs in larger chains.",
      magnitude: 0.45,
      channel: "employment",
    },
  ];
}
