"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Crosshair, FlaskRound, Gavel, Ghost, Landmark, Layers, Loader2, Radar, Search, UserRound } from "lucide-react";
import { PulseLine } from "@/components/Brand";
import { LocationBadge } from "@/components/LocationBadge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NewsRail } from "@/components/NewsRail";
import type { Bill, LocationError, SourceState, UserArea } from "@/lib/civic";
import { usePulse, type PulseSnapshot } from "@/lib/usePulse";

const HAS_MAP = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
});

const PulseMap = dynamic(() => import("@/components/PulseMap").then((m) => m.PulseMap), {
  ssr: false,
  loading: () => <MapLoading />,
});

// Deferred: pulls in framer-motion and only renders once a marker is opened,
// so it stays out of the initial homepage bundle.
const PolicyDetail = dynamic(() => import("@/components/PolicyDetail").then((m) => m.PolicyDetail), {
  ssr: false,
});

export default function Home() {
  const { snapshot, search, locate, locatePoint } = usePulse();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const router = useRouter();

  // Derive the open marker from current geometry so the detail auto-closes when
  // the area (and thus the markers) change — no synchronizing effect needed.
  const selected = snapshot.geo.markers.find((m) => m.id === selectedId) ?? null;

  const simulate = (bill: Bill) => {
    const area = snapshot.area;
    const qs = new URLSearchParams({ policy: `${bill.identifier} — ${bill.title}` });
    if (area) {
      qs.set("jurisdiction", area.region);
      qs.set("state", area.regionCode);
      qs.set("label", area.label);
      // Pass coordinates so the simulator can look up the user's specific
      // state legislators (OpenStates geo) for the "email your rep" flow.
      if (Number.isFinite(area.lat) && Number.isFinite(area.lng)) {
        qs.set("lat", String(area.lat));
        qs.set("lng", String(area.lng));
      }
    }
    router.push(`/simulate?${qs.toString()}`);
  };

  const totalBills = snapshot.federal.length + snapshot.state.length;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="relative border-b border-line backdrop-blur sticky top-0 z-30 bg-ink/80">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9 overflow-hidden rounded-xl ring-1 ring-line shadow-[0_0_18px_rgba(110,139,255,0.28)] bg-surface">
              <Image
                src="/policypulse-icon.png"
                alt="PolicyPulse logo"
                width={54}
                height={54}
                priority
                className="absolute left-1/2 top-1/2 w-[54px] h-[54px] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover"
              />
            </div>
            <div>
              <h1 className="font-display text-base font-semibold tracking-tight text-slate-50 leading-none">
                Policy<span className="text-signal-bright">Pulse</span>
              </h1>
              <p className="eyebrow mt-1.5">The law, moving around you</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LocationBadge
              area={snapshot.area}
              locating={snapshot.locating}
              error={snapshot.locationError}
              onSearch={search}
              onUseLocation={locate}
            />
            <Link
              href="/me"
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors"
            >
              <UserRound className="w-3.5 h-3.5" /> My Pulse
            </Link>
            <Link
              href="/ghost"
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors"
            >
              <Ghost className="w-3.5 h-3.5" /> Ghost Protocol
            </Link>
            <Link
              href="/council"
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors"
            >
              <Gavel className="w-3.5 h-3.5" /> Council
            </Link>
            <Link
              href="/lab"
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" /> Lab
            </Link>
            <Link
              href="/runs"
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors"
            >
              <FlaskRound className="w-3.5 h-3.5" /> Runs
            </Link>
            <Link
              href="/simulate"
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors"
            >
              Open simulator <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <PulseLine width={2000} height={20} className="absolute inset-x-0 -bottom-px h-5 opacity-70" />
      </header>

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-4 flex flex-col gap-4">
        <motion.div {...reveal(0)}>
          <HeroLine area={snapshot.area} totalBills={totalBills} loading={snapshot.loadingPolicies} />
        </motion.div>

        <motion.div {...reveal(0.08)} className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8 relative rounded-2xl min-h-[480px] h-[calc(100vh-300px)]">
            <PulseMap
              geo={snapshot.geo}
              area={snapshot.area}
              selectedId={selectedId}
              onSelect={(m) => setSelectedId(m?.id ?? null)}
              onPointToLocate={locatePoint}
            />
            <PolicyDetail marker={selected} onClose={() => setSelectedId(null)} onSimulate={simulate} />
            {HAS_MAP && !snapshot.area && !snapshot.locating && (
              <LocatePrompt onUseLocation={locate} onSearch={search} error={snapshot.locationError} />
            )}
          </div>

          <div className="col-span-12 lg:col-span-4 min-h-[480px] h-[calc(100vh-300px)]">
            <NewsRail
              articles={snapshot.news}
              loading={snapshot.loadingNews}
              status={snapshot.sources.news}
              area={snapshot.area}
            />
          </div>
        </motion.div>

        <motion.div {...reveal(0.16)}>
          <MissionBand snapshot={snapshot} />
        </motion.div>
      </main>
    </div>
  );
}

function HeroLine({ area, totalBills, loading }: { area: UserArea | null; totalBills: number; loading: boolean }) {
  return (
    <div className="glass rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-xl sm:text-2xl text-slate-100 leading-tight">
          Every law lands on someone.{" "}
          <span className="font-serif-editorial italic text-signal-bright">
            See where it lands.
          </span>
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          {area
            ? loading
              ? `Scanning the bills moving around ${area.label}…`
              : `${totalBills} federal & state ${totalBills === 1 ? "bill" : "bills"} are moving around ${area.label}. Tap a glowing marker.`
            : "Find your area to surface the real bills moving around you."}
        </p>
      </div>
      <Link
        href="/simulate"
        className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-ink bg-signal hover:bg-signal-bright rounded-xl px-4 py-2 transition-colors"
      >
        <Radar className="w-4 h-4" /> Simulate a policy
      </Link>
    </div>
  );
}

function LocatePrompt({
  onUseLocation,
  onSearch,
  error,
}: {
  onUseLocation: () => void;
  onSearch: (q: string) => void;
  error: LocationError | null;
}) {
  const [q, setQ] = useState("");
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
      <div className="glass rounded-2xl p-6 max-w-sm text-center pointer-events-auto">
        <div className="w-12 h-12 rounded-2xl bg-signal/15 flex items-center justify-center mx-auto mb-3">
          <Search className="w-6 h-6 text-signal-bright" />
        </div>
        <h3 className="font-display text-lg text-slate-100">Find the bills around you</h3>
        <p className="text-sm text-slate-400 mt-1.5">
          Click anywhere on the map, or enter a ZIP / city, to map the real legislation moving near you.
        </p>

        {error && (
          <div className="flex items-start gap-2 text-left mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-[12px] leading-relaxed text-amber-300">{error.message}</p>
          </div>
        )}

        {/* Search is the primary, reliable path — it works regardless of browser geolocation. */}
        <div className="search-pill flex items-center gap-1.5 mt-4 border border-line rounded-lg px-3 py-1.5 focus-within:border-signal/50 focus-within:ring-2 focus-within:ring-signal/40 transition-colors">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch(q)}
            placeholder="ZIP or city"
            className="bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none flex-1"
          />
          <button
            onClick={() => onSearch(q)}
            className="text-[11px] text-ink bg-signal hover:bg-signal-bright rounded px-2 py-1 font-medium transition-colors"
          >
            Go
          </button>
        </div>

        <button
          onClick={onUseLocation}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-lg px-3 py-2 mt-2 transition-colors"
        >
          <Crosshair className="w-4 h-4" /> Use my location
        </button>
        <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
          Tip: click any spot on the map to scan that exact area.
        </p>
      </div>
    </div>
  );
}

function MissionBand({ snapshot }: { snapshot: PulseSnapshot }) {
  return (
    <div className="glass rounded-2xl p-5 grid-bg flex flex-col lg:flex-row gap-5 lg:items-center justify-between">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 mb-2">
          <Landmark className="w-4 h-4 text-signal" />
          <span className="eyebrow">Why this matters</span>
        </div>
        <p className="font-serif-editorial text-lg text-slate-200 leading-snug">
          PolicyPulse is a civic-participation tool: it surfaces the real legislation moving around you and lets anyone
          stress-test a bill on a digital twin of their own community — built from live Census data — to see who it helps
          and who it hurts, <span className="italic text-signal-bright">before it ever becomes law.</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        <SourceChip label="Census ACS" state={snapshot.sources.census} />
        <SourceChip label="Congress.gov" state={snapshot.sources.congress} />
        <SourceChip label="OpenStates" state={snapshot.sources.openstates} />
        <SourceChip label="GNews" state={snapshot.sources.news} />
        <SourceChip
          label="Mapbox"
          state={HAS_MAP ? (snapshot.sources.geocode === "idle" ? "live" : snapshot.sources.geocode) : "missing_key"}
        />
      </div>
    </div>
  );
}

function SourceChip({ label, state }: { label: string; state: SourceState | "idle" }) {
  const map: Record<string, { dot: string; text: string }> = {
    live: { dot: "bg-emerald-400", text: "live" },
    empty: { dot: "bg-slate-500", text: "no data" },
    error: { dot: "bg-rose-400", text: "error" },
    missing_key: { dot: "bg-amber-400", text: "add key" },
    idle: { dot: "bg-slate-600", text: "—" },
  };
  const s = map[state] ?? map.idle;
  return (
    <div className="flex items-center gap-2 border border-line rounded-full px-3 py-1.5">
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      <span className="text-[11px] text-slate-300 font-medium">{label}</span>
      <span className="font-data text-[10px] text-slate-500">{s.text}</span>
    </div>
  );
}

function MapLoading() {
  return (
    <div className="w-full h-full rounded-2xl glass grid-bg flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-signal-bright animate-spin" />
    </div>
  );
}
