import { NextResponse, type NextRequest } from "next/server";
import { draftConstituentEmail, type EmailDraftInput } from "@/mastra/agents/advocate";
import type { SegmentImpact } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Draft a constituent email for a given representative + bill + simulation
// findings. Uses the Advocate agent when ANTHROPIC_API_KEY is set; otherwise a
// non-LLM template (graceful degradation).
export async function POST(req: NextRequest) {
  let payload: Partial<{
    repName: string;
    repTitle: string;
    billIdentifier: string;
    billTitle: string;
    jurisdiction: string;
    whoGetsHurt: SegmentImpact[];
    winners: SegmentImpact[];
    headline: string;
  }>;

  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const repName = (payload.repName || "").trim();
  const billIdentifier = (payload.billIdentifier || "").trim();
  if (!repName || !billIdentifier) {
    return NextResponse.json({ error: "repName and billIdentifier are required" }, { status: 400 });
  }

  const input: EmailDraftInput = {
    repName,
    repTitle: (payload.repTitle || "Representative").trim(),
    billIdentifier,
    billTitle: (payload.billTitle || "this measure").trim(),
    jurisdiction: (payload.jurisdiction || "our community").trim(),
    analysis: {
      whoGetsHurt: payload.whoGetsHurt ?? [],
      winners: payload.winners ?? [],
      headline: payload.headline ?? "",
    },
  };

  const draft = await draftConstituentEmail(input);
  return NextResponse.json(draft);
}
