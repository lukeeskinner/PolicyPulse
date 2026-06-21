import type { UserArea } from "../civic";
import { stateByAbbr, stateByName } from "../states";

// ============================================================================
// Location resolution via the Mapbox Geocoding API (v6).
//   - reverseGeocode: browser lat/lng  -> { city, county, state }
//   - forwardGeocode: typed ZIP / city -> { city, county, state }
// Server-side only so the token can be the same NEXT_PUBLIC_ token but is never
// required to be. Returns null (an honest empty state) when unconfigured.
// ============================================================================

function token(): string {
  return process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
}

export function geocodeConfigured(): boolean {
  return !!token();
}

interface MapboxFeature {
  properties?: {
    feature_type?: string;
    name?: string;
    coordinates?: { longitude?: number; latitude?: number };
    context?: {
      region?: { name?: string; region_code?: string; region_code_full?: string };
      place?: { name?: string };
      locality?: { name?: string };
      district?: { name?: string };
    };
  };
  geometry?: { coordinates?: [number, number] };
}

function featureToArea(
  f: MapboxFeature,
  fbLat: number,
  fbLng: number,
  source: UserArea["source"],
): UserArea | null {
  const props = f.properties ?? {};
  const ctx = props.context ?? {};
  const coords = f.geometry?.coordinates ?? [
    props.coordinates?.longitude ?? fbLng,
    props.coordinates?.latitude ?? fbLat,
  ];
  const lng = coords[0] ?? fbLng;
  const lat = coords[1] ?? fbLat;

  let regionName = ctx.region?.name;
  let regionCode = (ctx.region?.region_code || ctx.region?.region_code_full || "").replace(/^US-/i, "");

  if (props.feature_type === "region" && props.name) {
    regionName = props.name;
    if (!regionCode) regionCode = stateByName(props.name)?.abbr ?? "";
  }

  if (!regionCode && regionName) regionCode = stateByName(regionName)?.abbr ?? "";
  if (regionCode && !regionName) regionName = stateByAbbr(regionCode)?.name ?? regionName;
  if (!regionCode || !regionName) return null;
  regionCode = regionCode.toUpperCase();

  const city =
    ctx.place?.name ??
    (props.feature_type === "place" ? props.name : undefined) ??
    ctx.locality?.name ??
    null;
  const county = ctx.district?.name ?? null;

  return {
    city: city ?? null,
    county,
    region: regionName,
    regionCode,
    lat,
    lng,
    label: city ? `${city}, ${regionName}` : regionName,
    source,
  };
}

export async function reverseGeocode(lat: number, lng: number): Promise<UserArea | null> {
  const t = token();
  if (!t) return null;
  const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=place,region&limit=1&access_token=${t}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: MapboxFeature[] };
  const f = data.features?.[0];
  return f ? featureToArea(f, lat, lng, "geolocation") : null;
}

export async function forwardGeocode(q: string): Promise<UserArea | null> {
  const t = token();
  if (!t || !q.trim()) return null;
  const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(
    q,
  )}&country=us&types=place,region,postcode,locality&limit=1&access_token=${t}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: MapboxFeature[] };
  const f = data.features?.[0];
  return f ? featureToArea(f, 39.5, -98.35, "search") : null;
}
