import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadProfile } from "@/lib/ingest";
import { assessPersonalImpact } from "@/lib/personalImpact";
import { runPolicyAnalysis } from "@/mastra/agents/policy-analyst";
import type { PersonalPolicyDigest, UserPersona } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// Direct personal-impact endpoint (NO simulation).
//
// Given the user's self-described persona + a policy/bill, this grounds a
// demographic profile for their state, parses the policy into a structured
// model (LLM analyst when ANTHROPIC_API_KEY is set, heuristic otherwise), and
// returns a deterministic estimate of how the policy lands on THIS household.
//
// Privacy: nothing is persisted. Only the minimal persona feature vector + the
// policy text are sent; the persona itself lives in the browser's localStorage.
// ============================================================================

const ROLES = [
  "worker",
  "renter",
  "owner",
  "small_landlord",
  "business_owner",
  "retiree",
  "student",
] as const;

const personaSchema = z.object({
  name: z.string().max(80).optional(),
  age: z.number().int().min(16).max(110),
  householdSize: z.number().int().min(1).max(15),
  tenure: z.enum(["renter", "owner"]),
  income: z.number().min(0).max(10_000_000),
  monthlyHousingCost: z.number().min(0).max(200_000),
  role: z.enum(ROLES),
  sector: z.string().max(60).optional(),
  group: z.enum(["Black", "Hispanic", "Asian", "White", "Other"]).optional(),
  nativity: z.enum(["native", "immigrant"]).optional(),
  savings: z.number().min(0).max(50_000_000).optional(),
});

const bodySchema = z.object({
  persona: personaSchema,
  policy: z.string().min(1).max(8000),
  jurisdiction: z.string().min(1).max(120).optional(),
  stateCode: z.string().length(2).optional(),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { persona, policy, jurisdiction, stateCode } = parsed.data;
  const place = jurisdiction?.trim() || "your area";

  try {
    // Ground a demographic profile (live Census when keyed; synthesized
    // otherwise) so the estimate has a real local median income to anchor on.
    const { profile } = await loadProfile(place, stateCode?.toUpperCase());
    const model = await runPolicyAnalysis(policy, place);
    const impact = assessPersonalImpact(persona as UserPersona, model, profile);

    const digest: PersonalPolicyDigest = {
      title: model.title,
      type: model.type,
      summary: model.summary,
      mechanism: model.mechanism,
      confidence: model.confidence,
      modelSource: model.modelSource,
      intensity: model.intensity,
    };

    return NextResponse.json({ model: digest, impact });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to assess impact";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
