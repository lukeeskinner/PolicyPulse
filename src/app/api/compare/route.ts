import type { NextRequest } from "next/server";
import { analyzePolicy, compare, nullPolicyModel, prepareProfile } from "@/lib/headless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const policyA = (body?.policyA ?? body?.policy ?? "").toString().trim();
  const policyB = (body?.policyB ?? "").toString().trim();
  const jurisdiction = (body?.jurisdiction ?? "Oakland, CA").toString().trim() || "Oakland, CA";
  const stateCode = (body?.stateCode ?? "").toString().trim().toUpperCase() || undefined;

  let agentCount = Number(body?.agentCount ?? 60);
  if (!Number.isFinite(agentCount)) agentCount = 60;
  agentCount = Math.max(12, Math.min(120, Math.round(agentCount)));

  let draws = Number(body?.draws ?? 24);
  if (!Number.isFinite(draws)) draws = 24;
  draws = Math.max(8, Math.min(60, Math.round(draws)));

  if (!policyA || policyA.length < 8) {
    return Response.json({ error: "Policy A is required." }, { status: 400 });
  }

  try {
    // Shared community; both sides run on the same population per draw index.
    const profile = await prepareProfile(jurisdiction, stateCode);
    const modelA = await analyzePolicy(policyA, jurisdiction);
    const usingCounterfactual = !policyB || policyB.length < 8;
    let modelB;
    if (usingCounterfactual) {
      modelB = nullPolicyModel(jurisdiction);
      // True counterfactual: inherit A's underlying market assumption so the
      // ONLY difference is the policy mechanism, not the market environment.
      modelB.marketRentGrowthPct = modelA.marketRentGrowthPct;
    } else {
      modelB = await analyzePolicy(policyB, jurisdiction);
    }

    const labelA = (body?.labelA ?? "Policy A").toString().trim() || "Policy A";
    const labelB = usingCounterfactual
      ? "Status quo"
      : (body?.labelB ?? "Policy B").toString().trim() || "Policy B";

    const seedPrefix = `cmp:${jurisdiction}:${agentCount}`;
    const result = compare(profile, modelA, modelB, labelA, labelB, agentCount, draws, jurisdiction, seedPrefix);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Comparison failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
