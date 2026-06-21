import { NextResponse, type NextRequest } from "next/server";
import { cached, cacheKey } from "@/lib/cache";
import type { SourceState } from "@/lib/civic";
import { federalRepsConfigured, fetchFederalReps } from "@/lib/sources/representatives";
import { stateByAbbr } from "@/lib/states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elected representatives for ?state=CA. Federal members (Congress.gov) for now;
// state legislators are added in a later pass.
export async function GET(req: NextRequest) {
  const stateCode = (req.nextUrl.searchParams.get("state") || "").toUpperCase();
  if (!stateByAbbr(stateCode)) {
    return NextResponse.json({ reps: [], sources: { federal: "empty" as SourceState } });
  }

  const federal = federalRepsConfigured()
    ? await cached(cacheKey("reps:fed", stateCode), 12 * 60 * 60 * 1000, () =>
        fetchFederalReps(stateCode),
      ).catch(() => [])
    : [];

  const sources: { federal: SourceState } = {
    federal: !federalRepsConfigured() ? "missing_key" : federal.length ? "live" : "empty",
  };

  return NextResponse.json({ reps: federal, sources });
}
