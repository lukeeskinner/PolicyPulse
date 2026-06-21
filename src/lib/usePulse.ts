"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPulseGeo,
  type Bill,
  type LocationError,
  type LocationErrorKind,
  type NewsArticle,
  type PulseGeo,
  type SourceState,
  type UserArea,
} from "./civic";
import type { DemographicProfile } from "./types";

// Human-readable, actionable copy for every way locating can fail. Each one
// points the user at the ZIP/city search, which works regardless of browser geo.
const LOCATION_MESSAGES: Record<LocationErrorKind, string> = {
  unsupported: "This browser can't share your location — search by ZIP or city instead.",
  insecure:
    "Location only works on a secure connection. Open the app at http://localhost:3000 (or HTTPS) — or just search by ZIP or city.",
  denied: "Location access is blocked. Allow it in your browser settings, or search by ZIP or city.",
  unavailable: "Your location is unavailable right now — search by ZIP or city instead.",
  timeout: "Finding your location took too long — search by ZIP or city instead.",
  notfound: 'Couldn\'t match that to a U.S. state. Try a ZIP code or "City, State".',
  missing_key: "Location lookup isn't configured yet (missing Mapbox token).",
};

function makeLocationError(kind: LocationErrorKind): LocationError {
  return { kind, message: LOCATION_MESSAGES[kind] };
}

// ============================================================================
// usePulse — drives the live homepage.
//   1. resolve the user's area (browser geolocation, with a ZIP/city fallback)
//   2. fetch real federal + state bills, local news, and ACS demographics
//   3. expose map geometry + source health for honest empty states
// Each data slice loads independently so the UI fills in progressively.
// ============================================================================

interface Sources {
  congress: SourceState;
  openstates: SourceState;
  news: SourceState;
  census: SourceState;
  geocode: SourceState | "idle";
}

export interface PulseSnapshot {
  area: UserArea | null;
  locating: boolean;
  needsLocation: boolean;
  locationError: LocationError | null;
  federal: Bill[];
  state: Bill[];
  geo: PulseGeo;
  news: NewsArticle[];
  profile: DemographicProfile | null;
  loadingPolicies: boolean;
  loadingNews: boolean;
  loadingCensus: boolean;
  sources: Sources;
}

const EMPTY_GEO: PulseGeo = { markers: [], arcs: [] };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function usePulse() {
  const [area, setArea] = useState<UserArea | null>(null);
  const [locating, setLocating] = useState(true);
  const [needsLocation, setNeedsLocation] = useState(false);
  const [locationError, setLocationError] = useState<LocationError | null>(null);

  const [federal, setFederal] = useState<Bill[]>([]);
  const [state, setStateBills] = useState<Bill[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [profile, setProfile] = useState<DemographicProfile | null>(null);

  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);
  const [loadingCensus, setLoadingCensus] = useState(false);

  const [sources, setSources] = useState<Sources>({
    congress: "empty",
    openstates: "empty",
    news: "empty",
    census: "empty",
    geocode: "idle",
  });

  const resolved = useRef(false);

  // Map a geocode call that produced no area onto an actionable error: a
  // missing Mapbox token vs. simply no US match for the coords/query.
  const errorFromStatus = (status?: SourceState): LocationError =>
    makeLocationError(status === "missing_key" ? "missing_key" : "notfound");

  const resolveByCoords = useCallback(async (lat: number, lng: number): Promise<UserArea | null> => {
    const data = await getJson<{ area: UserArea | null; status: SourceState }>(
      `/api/geo?lat=${lat}&lng=${lng}`,
    );
    setSources((s) => ({ ...s, geocode: data?.status ?? "error" }));
    if (data?.area) {
      setArea(data.area);
      setNeedsLocation(false);
      setLocationError(null);
    } else {
      setNeedsLocation(true);
      setLocationError(errorFromStatus(data?.status));
    }
    setLocating(false);
    return data?.area ?? null;
  }, []);

  // Resolve an area directly from a point on the map (the "point to locate"
  // dwell affordance). Reuses the same coords path as browser geolocation so
  // bills / news / census refresh identically; returns the area so the map can
  // give inline, on-cursor feedback ("Area set: Oakland, CA").
  const locatePoint = useCallback(
    (lat: number, lng: number) => resolveByCoords(lat, lng),
    [resolveByCoords],
  );

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLocating(true);
    setLocationError(null);
    const data = await getJson<{ area: UserArea | null; status: SourceState }>(
      `/api/geo?q=${encodeURIComponent(q.trim())}`,
    );
    setSources((s) => ({ ...s, geocode: data?.status ?? "error" }));
    if (data?.area) {
      setArea(data.area);
      setNeedsLocation(false);
      setLocationError(null);
    } else {
      setNeedsLocation(true);
      setLocationError(errorFromStatus(data?.status));
    }
    setLocating(false);
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError(makeLocationError("unsupported"));
      setNeedsLocation(true);
      setLocating(false);
      return;
    }
    // Browser geolocation is blocked on insecure origins — notably the LAN IP
    // `next dev` prints. Calling getCurrentPosition there surfaces a misleading
    // "permission denied", so short-circuit with a clear message instead.
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      console.warn(
        "[usePulse] geolocation unavailable: insecure context. Use http://localhost:3000 or HTTPS.",
      );
      setLocationError(makeLocationError("insecure"));
      setNeedsLocation(true);
      setLocating(false);
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolveByCoords(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        const kind: LocationErrorKind =
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.TIMEOUT
              ? "timeout"
              : "unavailable";
        console.warn(`[usePulse] geolocation error (code ${err.code}): ${err.message}`);
        setLocationError(makeLocationError(kind));
        setNeedsLocation(true);
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  }, [resolveByCoords]);

  // initial attempt on mount
  useEffect(() => {
    if (resolved.current) return;
    resolved.current = true;
    locate();
  }, [locate]);

  // when the area changes, load every live slice in parallel
  useEffect(() => {
    if (!area) return;
    const code = area.regionCode;

    setLoadingPolicies(true);
    getJson<{ federal: Bill[]; state: Bill[]; sources: { congress: SourceState; openstates: SourceState } }>(
      `/api/policies?state=${code}`,
    ).then((d) => {
      setFederal(d?.federal ?? []);
      setStateBills(d?.state ?? []);
      setSources((s) => ({
        ...s,
        congress: d?.sources.congress ?? "error",
        openstates: d?.sources.openstates ?? "error",
      }));
      setLoadingPolicies(false);
    });

    setLoadingNews(true);
    const newsUrl = `/api/news?region=${encodeURIComponent(area.region)}${
      area.city ? `&city=${encodeURIComponent(area.city)}` : ""
    }`;
    getJson<{ articles: NewsArticle[]; status: SourceState }>(newsUrl).then((d) => {
      setNews(d?.articles ?? []);
      setSources((s) => ({ ...s, news: d?.status ?? "error" }));
      setLoadingNews(false);
    });

    setLoadingCensus(true);
    getJson<{ profile: DemographicProfile | null; status: SourceState }>(
      `/api/census?state=${code}`,
    ).then((d) => {
      setProfile(d?.profile ?? null);
      setSources((s) => ({ ...s, census: d?.status ?? "error" }));
      setLoadingCensus(false);
    });
  }, [area]);

  const geo = useMemo(() => (area ? buildPulseGeo(area, federal, state) : EMPTY_GEO), [area, federal, state]);

  const snapshot: PulseSnapshot = {
    area,
    locating,
    needsLocation,
    locationError,
    federal,
    state,
    geo,
    news,
    profile,
    loadingPolicies,
    loadingNews,
    loadingCensus,
    sources,
  };

  return { snapshot, search, locate, locatePoint };
}
