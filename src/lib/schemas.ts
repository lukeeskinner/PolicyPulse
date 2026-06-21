import { z } from "zod";
import type { Channel, PolicyModel } from "./types";
import { clamp } from "./utils";

// Zod schema describing the structured output we want from the PolicyAnalyst
// agent. It mirrors PolicyModel so the LLM result drops straight into the engine.

export const POLICY_TYPES = [
  "rent_control",
  "min_wage",
  "zoning",
  "tax",
  "healthcare",
  "immigration",
  "generic",
] as const;

export const CHANNELS = ["income", "housing", "employment", "wealth", "stability"] as const;

export const analystSchema = z.object({
  type: z.enum(POLICY_TYPES).describe("Best-fit policy category"),
  title: z.string().describe("Short human title for the policy (<= 80 chars)"),
  summary: z.string().describe("1-2 sentence plain-language summary of what it does"),
  mechanism: z.string().describe("How it actually changes incentives and behavior"),
  intensity: z.number().min(0).max(1).describe("Overall strength/bite of the policy, 0..1"),
  timeProfile: z
    .enum(["frontloaded", "gradual", "delayed"])
    .describe("How fast effects materialize over 3 years"),
  rentCapPct: z.number().optional().describe("If rent control: allowed annual increase, e.g. 0.03"),
  marketRentGrowthPct: z.number().optional().describe("Counterfactual market rent growth, e.g. 0.07"),
  wageTarget: z.number().optional().describe("If minimum wage: new hourly minimum in dollars"),
  supplyElasticity: z.number().min(0).max(1).optional().describe("How strongly supply reacts, 0..1"),
  channels: z
    .object({
      income: z.number().min(-1).max(1),
      housing: z.number().min(-1).max(1),
      employment: z.number().min(-1).max(1),
      wealth: z.number().min(-1).max(1),
      stability: z.number().min(-1).max(1),
    })
    .describe("Net societal direction per life channel (-1 harmful .. +1 helpful)"),
  beneficiaries: z
    .array(z.object({ key: z.string(), weight: z.number().min(0).max(1) }))
    .describe("Roles/groups that benefit. key is a role (worker, renter, owner, small_landlord, business_owner, retiree, student) or a group (Black, Hispanic, Asian, White, Other)"),
  burdened: z
    .array(z.object({ key: z.string(), weight: z.number().min(0).max(1) }))
    .describe("Roles/groups that bear the cost, same key vocabulary"),
  unintended: z
    .array(
      z.object({
        flag: z.string(),
        statement: z.string(),
        magnitude: z.number().min(0).max(1),
        channel: z.enum(CHANNELS),
      }),
    )
    .describe("Likely second-order / unintended consequences"),
  confidence: z.number().min(0).max(1).describe("Your confidence in this model, 0..1"),
});

export type AnalystOutput = z.infer<typeof analystSchema>;

export function toPolicyModel(out: AnalystOutput, raw: string): PolicyModel {
  return {
    type: out.type,
    title: out.title.slice(0, 90),
    summary: out.summary,
    mechanism: out.mechanism,
    raw,
    intensity: clamp(out.intensity, 0, 1),
    rentCapPct: out.rentCapPct,
    marketRentGrowthPct: out.marketRentGrowthPct,
    wageTarget: out.wageTarget,
    supplyElasticity: out.supplyElasticity,
    timeProfile: out.timeProfile,
    channels: out.channels as Record<Channel, number>,
    beneficiaries: out.beneficiaries,
    burdened: out.burdened,
    unintended: out.unintended,
    confidence: clamp(out.confidence, 0, 1),
    modelSource: "llm",
  };
}
