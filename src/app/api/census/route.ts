import { NextResponse, type NextRequest } from "next/server";
import { cached, cacheKey } from "@/lib/cache";
import { censusConfigured, fetchStateCensusProfile } from "@/lib/sources/census";
import { stateByAbbr } from "@/lib/states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live ACS demographic profile for ?state=CA, used to ground the population.
export async function GET(req: NextRequest) {
  const stateCode = (req.nextUrl.searchParams.get("state") || "").toUpperCase();
  if (!stateByAbbr(stateCode)) {
    return NextResponse.json({ profile: null, status: "empty" });
  }
  if (!censusConfigured()) {
    return NextResponse.json({ profile: null, status: "missing_key" });
  }

  try {
    const profile = await cached(cacheKey("census", stateCode), 6 * 3600 * 1000, () =>
      fetchStateCensusProfile(stateCode),
    );
    return NextResponse.json({ profile, status: profile ? "live" : "error" });
  } catch {
    return NextResponse.json({ profile: null, status: "error" });
  }
}
