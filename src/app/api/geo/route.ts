import { NextResponse, type NextRequest } from "next/server";
import { cached, cacheKey } from "@/lib/cache";
import { forwardGeocode, geocodeConfigured, reverseGeocode } from "@/lib/sources/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve a user's area from browser coordinates (?lat=&lng=) or a typed
// ZIP / city (?q=). Returns an honest null + status when Mapbox is unconfigured.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  if (!geocodeConfigured()) {
    return NextResponse.json({ area: null, status: "missing_key" });
  }

  const q = sp.get("q");
  const lat = sp.get("lat");
  const lng = sp.get("lng");

  try {
    if (q && q.trim()) {
      const area = await cached(cacheKey("geo:fwd", q.trim().toLowerCase()), 24 * 3600 * 1000, () =>
        forwardGeocode(q.trim()),
      );
      return NextResponse.json({ area, status: area ? "live" : "empty" });
    }
    if (lat && lng) {
      const la = Number(lat);
      const ln = Number(lng);
      if (!Number.isFinite(la) || !Number.isFinite(ln)) {
        return NextResponse.json({ area: null, status: "empty" });
      }
      const area = await cached(
        cacheKey("geo:rev", la.toFixed(2), ln.toFixed(2)),
        24 * 3600 * 1000,
        () => reverseGeocode(la, ln),
      );
      return NextResponse.json({ area, status: area ? "live" : "empty" });
    }
    return NextResponse.json({ area: null, status: "empty" });
  } catch {
    return NextResponse.json({ area: null, status: "error" });
  }
}
