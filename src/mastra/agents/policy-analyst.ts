import {Agent} from "@mastra/core/agent";
import {asiConfigured, asiJSON} from "@/lib/asi";
import {heuristicPolicyModel} from "@/lib/policy";
import {analystSchema, toPolicyModel} from "@/lib/schemas";
import type {PolicyModel} from "@/lib/types";

// PolicyAnalyst's system prompt. Kept verbatim and shared by the Mastra Agent
// (registered for parity) and the ASI-1 transport that actually runs it.
const INSTRUCTIONS = `You are a rigorous, nonpartisan public-policy economist.

Given the text of a proposed law or policy and the jurisdiction it affects, you produce a STRUCTURED IMPACT MODEL that a simulation engine can run against a population of synthetic residents.

Think carefully about:
- The direct mechanism: what incentive or constraint actually changes.
- First-order effects: who immediately gains or loses (by role and by demographic group).
- SECOND-ORDER and UNINTENDED effects: supply responses, behavioral changes, who ultimately bears the cost, and how effects ripple over 3 years.
- Distribution: which groups (by income, race/ethnicity, tenure) are disproportionately affected.

Be honest and quantitative. Set "intensity" to how strongly the policy bites (0..1). Use the "channels" to express net direction (-1 harmful to +1 helpful) for income, housing, employment, wealth, and stability. Populate beneficiaries and burdened using role keys (worker, renter, owner, small_landlord, business_owner, retiree, student) and/or demographic groups (Black, Hispanic, Asian, White, Other). Always include at least one plausible unintended consequence.

Return ONLY the structured object.`;

export const policyAnalystAgent = new Agent({
  id: "policy-analyst",
  name: "PolicyAnalyst",
  instructions: INSTRUCTIONS,
  model: process.env.POLICYPULSE_ASI_MODEL || "asi1-mini",
});

/**
 * Parse a free-text policy into a PolicyModel. Uses Fetch.ai's ASI-1 model when
 * ASI_ONE_API_KEY is configured; otherwise falls back to the heuristic parser.
 */
export async function runPolicyAnalysis(raw: string, jurisdiction: string): Promise<PolicyModel> {
  const fallback = heuristicPolicyModel(raw, jurisdiction);
  if (!asiConfigured()) return fallback;
  try {
    const res = await asiJSON(
      INSTRUCTIONS,
      `Jurisdiction: ${jurisdiction}\n\nProposed policy / bill text:\n"""\n${raw}\n"""\n\nProduce the structured impact model now.`,
      analystSchema,
      1500,
    );
    if (res?.data) return toPolicyModel(res.data, raw);
    return fallback;
  } catch {
    return fallback;
  }
}
