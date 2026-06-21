import { DC_HUB, stateByAbbr } from "./states";

// ============================================================================
// Civic domain types shared across the live data sources, API routes, and the
// Pulse Map UI. Plus pure, client-safe helpers that turn a list of real bills
// into the markers + arcs the 3D map renders. No mock data lives here — empty
// inputs simply produce empty geometry.
// ============================================================================

export interface UserArea {
  city: string | null;
  county: string | null;
  region: string; // full state name, e.g. "California"
  regionCode: string; // "CA"
  lat: number;
  lng: number;
  label: string; // "Oakland, California" or "California"
  source: "geolocation" | "search" | "default";
}

export type BillLevel = "federal" | "state";

export interface Bill {
  id: string;
  level: BillLevel;
  identifier: string; // "H.R. 1234" / "AB 567"
  title: string;
  summary?: string;
  status?: string;
  latestAction?: string;
  latestActionDate?: string;
  url?: string;
  sponsor?: string;
  sponsorParty?: string; // "D" | "R" | "I" | ...
  chamber?: string;
  jurisdiction: string; // "United States" | "California"
  stateCode?: string; // sponsor (federal) or bill (state) state
  subjects?: string[];
  updatedAt?: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  description?: string;
  source: string;
  url: string;
  imageUrl?: string;
  publishedAt: string;
}

export type SourceState = "live" | "missing_key" | "error" | "empty";

export interface PulseSources {
  congress: SourceState;
  openstates: SourceState;
  news: SourceState;
  census: SourceState;
  geocode: SourceState;
}

export interface PolicyMarker {
  id: string;
  kind: "federal-hub" | "delegation" | "state-house";
  lat: number;
  lng: number;
  stateCode?: string;
  title: string;
  subtitle: string;
  count: number;
  weight: number; // 0..1 for sizing
  bills: Bill[];
}

export interface PolicyArc {
  id: string;
  source: [number, number]; // [lng, lat]
  target: [number, number];
  weight: number;
}

export interface PulseGeo {
  markers: PolicyMarker[];
  arcs: PolicyArc[];
}

// Turn real bills into map geometry. Federal bills cluster onto their sponsor's
// state capital (with an arc to the D.C. hub); state bills cluster onto the
// user's state capital. Returns empty geometry for empty inputs — never faked.
export function buildPulseGeo(
  area: UserArea | null,
  federal: Bill[],
  state: Bill[],
): PulseGeo {
  const markers: PolicyMarker[] = [];
  const arcs: PolicyArc[] = [];

  // --- federal: group by sponsor state into delegation markers ---
  const byState = new Map<string, Bill[]>();
  for (const b of federal) {
    const code = b.stateCode?.toUpperCase();
    if (!code || !stateByAbbr(code)) continue;
    const arr = byState.get(code) ?? [];
    arr.push(b);
    byState.set(code, arr);
  }

  for (const [code, bills] of byState) {
    const s = stateByAbbr(code)!;
    markers.push({
      id: `delegation-${code}`,
      kind: "delegation",
      lat: s.lat,
      lng: s.lng,
      stateCode: code,
      title: `${s.name} delegation`,
      subtitle: `${bills.length} federal ${bills.length === 1 ? "bill" : "bills"} in Congress`,
      count: bills.length,
      weight: 0,
      bills,
    });
    arcs.push({
      id: `arc-${code}`,
      source: [s.lng, s.lat],
      target: [DC_HUB.lng, DC_HUB.lat],
      weight: bills.length,
    });
  }

  // --- federal hub at D.C. ---
  if (federal.length > 0) {
    markers.push({
      id: "federal-hub",
      kind: "federal-hub",
      lat: DC_HUB.lat,
      lng: DC_HUB.lng,
      title: "U.S. Congress",
      subtitle: `${federal.length} federal ${federal.length === 1 ? "bill" : "bills"} near you`,
      count: federal.length,
      weight: 1,
      bills: federal,
    });
  }

  // --- state legislature at the user's capital ---
  if (state.length > 0 && area) {
    const s = stateByAbbr(area.regionCode);
    if (s) {
      markers.push({
        id: `state-${s.abbr}`,
        kind: "state-house",
        lat: s.lat,
        lng: s.lng,
        stateCode: s.abbr,
        title: `${s.name} Legislature`,
        subtitle: `${state.length} state ${state.length === 1 ? "bill" : "bills"} moving`,
        count: state.length,
        bills: state,
        weight: 0,
      });
    }
  }

  // normalize weights for sizing
  const max = Math.max(1, ...markers.map((m) => m.count));
  for (const m of markers) m.weight = Math.max(0.15, m.count / max);

  return { markers, arcs };
}

export function partyColor(party?: string): [number, number, number] {
  const p = (party ?? "").toLowerCase();
  if (p.startsWith("d")) return [56, 152, 236];
  if (p.startsWith("r")) return [236, 86, 86];
  return [148, 163, 184];
}
