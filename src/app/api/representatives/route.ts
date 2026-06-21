import { NextResponse, type NextRequest } from "next/server";
import { cached, cacheKey } from "@/lib/cache";
import type { SourceState } from "@/lib/civic";
import {
  federalRepsConfigured,
  fetchFederalReps,
  fetchStateReps,
  stateRepsConfigured,
} from "@/lib/sources/representatives";
import { stateByAbbr } from "@/lib/states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elected representatives for ?state=CA, merging federal members (Congress.gov)
// and the user's state legislators (OpenStates). State lookup is geo-based, so
// pass ?lat=&lng= to surface the resident's specific districts.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const stateCode = (sp.get("state") || "").toUpperCase();
  const latRaw = sp.get("lat");
  const lngRaw = sp.get("lng");
  const lat = latRaw != null && latRaw !== "" ? Number(latRaw) : undefined;
  const lng = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : undefined;
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng);

  if (!stateByAbbr(stateCode)) {
    return NextResponse.json({
      reps: [],
      sources: { federal: "empty" as SourceState, state: "empty" as SourceState },
    });
  }

  const [federal, state] = await Promise.all([
    federalRepsConfigured()
      ? cached(cacheKey("reps:fed", stateCode), 12 * 60 * 60 * 1000, () =>
          fetchFederalReps(stateCode),
        ).catch(() => [])
      : Promise.resolve([]),
    stateRepsConfigured() && hasGeo
      ? cached(
          cacheKey("reps:state", stateCode, lat!.toFixed(3), lng!.toFixed(3)),
          12 * 60 * 60 * 1000,
          () => fetchStateReps(stateCode, { lat, lng }),
        ).catch(() => [])
      : Promise.resolve([]),
  ]);

  const sources: { federal: SourceState; state: SourceState } = {
    federal: !federalRepsConfigured() ? "missing_key" : federal.length ? "live" : "empty",
    state: !stateRepsConfigured()
      ? "missing_key"
      : !hasGeo
        ? "empty"
        : state.length
          ? "live"
          : "empty",
  };

  return NextResponse.json({ reps: [...federal, ...state], sources });
}
