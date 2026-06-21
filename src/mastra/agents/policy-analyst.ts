import { Agent } from "@mastra/core/agent";
import { heuristicPolicyModel } from "@/lib/policy";
import { analystSchema, toPolicyModel } from "@/lib/schemas";
import type { PolicyModel } from "@/lib/types";

const MODEL = process.env.POLICYPULSE_ANALYST_MODEL || "anthropic/claude-3-5-haiku-20241022";

export const policyAnalystAgent = new Agent({
  id: "policy-analyst",
  name: "PolicyAnalyst",
  instructions: `You are a rigorous, nonpartisan public-policy economist.

Given the text of a proposed law or policy and the jurisdiction it affects, you produce a STRUCTURED IMPACT MODEL that a simulation engine can run against a population of synthetic residents.

Think carefully about:
- The direct mechanism: what incentive or constraint actually changes.
- First-order effects: who immediately gains or loses (by role and by demographic group).
- SECOND-ORDER and UNINTENDED effects: supply responses, behavioral changes, who ultimately bears the cost, and how effects ripple over 3 years.
- Distribution: which groups (by income, race/ethnicity, tenure) are disproportionately affected.

Be honest and quantitative. Set "intensity" to how strongly the policy bites (0..1). Use the "channels" to express net direction (-1 harmful to +1 helpful) for income, housing, employment, wealth, and stability. Populate beneficiaries and burdened using role keys (worker, renter, owner, small_landlord, business_owner, retiree, student) and/or demographic groups (Black, Hispanic, Asian, White, Other). Always include at least one plausible unintended consequence.

Return ONLY the structured object.`,
  model: MODEL,
});

/**
 * Parse a free-text policy into a PolicyModel. Uses the PolicyAnalyst agent when
 * ANTHROPIC_API_KEY is configured; otherwise falls back to the heuristic parser.
 */
export async function runPolicyAnalysis(raw: string, jurisdiction: string): Promise<PolicyModel> {
  const fallback = heuristicPolicyModel(raw, jurisdiction);
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  try {
    const res = await policyAnalystAgent.generate(
      `Jurisdiction: ${jurisdiction}\n\nProposed policy / bill text:\n"""\n${raw}\n"""\n\nProduce the structured impact model now.`,
      { structuredOutput: { schema: analystSchema, errorStrategy: "warn" } },
    );
    if (res.object) return toPolicyModel(res.object, raw);
    return fallback;
  } catch {
    return fallback;
  }
}
