import type { Outcome, Role } from "./types";

// Client-safe UI constants & helpers (no server imports).

export const GROUP_COLORS: Record<string, string> = {
  Black: "#f59e0b",
  Hispanic: "#fb7185",
  Asian: "#22d3ee",
  White: "#a78bfa",
  Other: "#34d399",
};

export function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? "#94a3b8";
}

export const OUTCOME_COLORS: Record<Outcome, string> = {
  better: "#34d399",
  stable: "#64748b",
  worse: "#f59e0b",
  displaced: "#ef4444",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  better: "Better off",
  stable: "Held steady",
  worse: "Worse off",
  displaced: "Displaced",
};

export function roleShort(roles: Role[]): string {
  if (roles.includes("small_landlord")) return "Small landlord";
  if (roles.includes("business_owner")) return "Business owner";
  if (roles.includes("retiree")) return "Retiree";
  if (roles.includes("student")) return "Student";
  if (roles.includes("worker")) return "Worker";
  return "Resident";
}

export const PHASE_LABEL: Record<string, string> = {
  idle: "Idle",
  analyzing: "Analyzing the policy",
  ingesting: "Ingesting the community",
  spawning: "Spawning residents",
  simulating: "Living through the policy",
  finalizing: "Measuring the impact",
  done: "Complete",
  error: "Error",
};

export const JURISDICTIONS = [
  "Oakland, CA",
  "San Francisco, CA",
  "Seattle, WA",
  "Austin, TX",
  "New York, NY",
];

export interface Preset {
  label: string;
  jurisdiction: string;
  agentCount: number;
  policy: string;
}

export const PRESETS: Preset[] = [
  {
    label: "Oakland rent control",
    jurisdiction: "Oakland, CA",
    agentCount: 60,
    policy:
      "Cap annual rent increases for existing tenants at 3% per year across all rental units in the city, with just-cause eviction protections.",
  },
  {
    label: "Seattle $20 minimum wage",
    jurisdiction: "Seattle, WA",
    agentCount: 60,
    policy:
      "Raise the citywide minimum wage to $20.00 per hour for all employers, phased in over the first year.",
  },
  {
    label: "Austin upzoning",
    jurisdiction: "Austin, TX",
    agentCount: 60,
    policy:
      "Eliminate single-family-only zoning citywide, allowing up to three units on any residential lot and reducing minimum lot sizes to encourage density.",
  },
  {
    label: "SF vacancy tax",
    jurisdiction: "San Francisco, CA",
    agentCount: 60,
    policy:
      "Impose an annual vacancy tax on residential units left empty for more than 182 days per year to push unused housing back onto the rental market.",
  },
];

export function toneClass(tone: "good" | "bad" | "warn" | "neutral"): string {
  switch (tone) {
    case "good":
      return "text-emerald-300";
    case "bad":
      return "text-rose-400";
    case "warn":
      return "text-amber-300";
    default:
      return "text-slate-300";
  }
}
