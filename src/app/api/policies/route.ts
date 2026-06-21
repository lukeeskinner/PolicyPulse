import { NextResponse, type NextRequest } from "next/server";
import { cached, cacheKey } from "@/lib/cache";
import type { SourceState } from "@/lib/civic";
import { congressConfigured, fetchFederalBills } from "@/lib/sources/congress";
import { fetchStateBills, openStatesConfigured } from "@/lib/sources/openstates";
import { stateByAbbr } from "@/lib/states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real federal (Congress.gov) + state (OpenStates) bills for ?state=CA.
export async function GET(req: NextRequest) {
  const stateCode = (req.nextUrl.searchParams.get("state") || "").toUpperCase();
  if (!stateByAbbr(stateCode)) {
    return NextResponse.json({
      federal: [],
      state: [],
      sources: { congress: "empty", openstates: "empty" },
    });
  }

  const [federal, stateBills] = await Promise.all([
    congressConfigured()
      ? cached(cacheKey("bills:fed", stateCode), 30 * 60 * 1000, () => fetchFederalBills(stateCode)).catch(() => [])
      : Promise.resolve([]),
    openStatesConfigured()
      ? cached(cacheKey("bills:state", stateCode), 30 * 60 * 1000, () => fetchStateBills(stateCode)).catch(() => [])
      : Promise.resolve([]),
  ]);

  const sources: { congress: SourceState; openstates: SourceState } = {
    congress: !congressConfigured() ? "missing_key" : federal.length ? "live" : "empty",
    openstates: !openStatesConfigured() ? "missing_key" : stateBills.length ? "live" : "empty",
  };

  return NextResponse.json({ federal, state: stateBills, sources });
}
