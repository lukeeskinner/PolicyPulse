"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildPulseGeo, type Bill, type NewsArticle, type PulseGeo, type SourceState, type UserArea } from "./civic";
import type { DemographicProfile } from "./types";

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

  const resolveByCoords = useCallback(async (lat: number, lng: number) => {
    const data = await getJson<{ area: UserArea | null; status: SourceState }>(
      `/api/geo?lat=${lat}&lng=${lng}`,
    );
    setSources((s) => ({ ...s, geocode: data?.status ?? "error" }));
    if (data?.area) {
      setArea(data.area);
      setNeedsLocation(false);
    } else {
      setNeedsLocation(true);
    }
    setLocating(false);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLocating(true);
    const data = await getJson<{ area: UserArea | null; status: SourceState }>(
      `/api/geo?q=${encodeURIComponent(q.trim())}`,
    );
    setSources((s) => ({ ...s, geocode: data?.status ?? "error" }));
    if (data?.area) {
      setArea(data.area);
      setNeedsLocation(false);
    } else {
      setNeedsLocation(true);
    }
    setLocating(false);
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNeedsLocation(true);
      setLocating(false);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolveByCoords(pos.coords.latitude, pos.coords.longitude),
      () => {
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

  return { snapshot, search, locate };
}
