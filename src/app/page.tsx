"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, Crosshair, Landmark, Loader2, Radar, Search } from "lucide-react";
import { LocationBadge } from "@/components/LocationBadge";
import { NewsRail } from "@/components/NewsRail";
import { PolicyDetail } from "@/components/PolicyDetail";
import type { Bill, SourceState, UserArea } from "@/lib/civic";
import { usePulse, type PulseSnapshot } from "@/lib/usePulse";

const HAS_MAP = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const PulseMap = dynamic(() => import("@/components/PulseMap").then((m) => m.PulseMap), {
  ssr: false,
  loading: () => <MapLoading />,
});

export default function Home() {
  const { snapshot, search, locate } = usePulse();
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
    }
    router.push(`/simulate?${qs.toString()}`);
  };

  const totalBills = snapshot.federal.length + snapshot.state.length;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800/70 backdrop-blur sticky top-0 z-30 bg-[#05070e]/80">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center">
              <Activity className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <h1 className="font-display text-base font-bold tracking-tight text-slate-50 leading-none">PolicyPulse</h1>
              <p className="text-[11px] text-slate-400 mt-0.5">The law, moving around you — in real time</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LocationBadge
              area={snapshot.area}
              locating={snapshot.locating}
              onSearch={search}
              onUseLocation={locate}
            />
            <Link
              href="/simulate"
              className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-cyan-200 border border-slate-700/70 hover:border-cyan-500/50 rounded-full px-3 py-1.5 transition-colors"
            >
              Open simulator <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-4 flex flex-col gap-4">
        <HeroLine area={snapshot.area} totalBills={totalBills} loading={snapshot.loadingPolicies} />

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8 relative rounded-2xl min-h-[480px] h-[calc(100vh-300px)]">
            <PulseMap
              geo={snapshot.geo}
              area={snapshot.area}
              selectedId={selectedId}
              onSelect={(m) => setSelectedId(m?.id ?? null)}
            />
            <PolicyDetail marker={selected} onClose={() => setSelectedId(null)} onSimulate={simulate} />
            {HAS_MAP && !snapshot.area && !snapshot.locating && (
              <LocatePrompt onUseLocation={locate} onSearch={search} />
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
        </div>

        <MissionBand snapshot={snapshot} />
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
          <span className="font-serif-editorial italic bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent">
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
        className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-slate-950 bg-gradient-to-r from-cyan-300 to-violet-300 hover:from-cyan-200 hover:to-violet-200 rounded-xl px-4 py-2 transition-colors"
      >
        <Radar className="w-4 h-4" /> Simulate a policy
      </Link>
    </div>
  );
}

function LocatePrompt({ onUseLocation, onSearch }: { onUseLocation: () => void; onSearch: (q: string) => void }) {
  const [q, setQ] = useState("");
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
      <div className="glass rounded-2xl p-6 max-w-sm text-center pointer-events-auto">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 flex items-center justify-center mx-auto mb-3">
          <Crosshair className="w-6 h-6 text-cyan-300" />
        </div>
        <h3 className="font-display text-lg text-slate-100">Find the bills around you</h3>
        <p className="text-sm text-slate-400 mt-1.5">
          Share your location or enter a ZIP / city to map the real legislation moving near you.
        </p>
        <button
          onClick={onUseLocation}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-slate-950 bg-cyan-300 hover:bg-cyan-200 rounded-lg px-3 py-2 mt-4 transition-colors"
        >
          <Crosshair className="w-4 h-4" /> Use my location
        </button>
        <div className="flex items-center gap-1.5 mt-2 border border-slate-700/70 rounded-lg px-3 py-1.5">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch(q)}
            placeholder="ZIP or city"
            className="bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none flex-1"
          />
          <button
            onClick={() => onSearch(q)}
            className="text-[11px] text-slate-950 bg-slate-300 hover:bg-white rounded px-2 py-1 font-medium transition-colors"
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}

function MissionBand({ snapshot }: { snapshot: PulseSnapshot }) {
  return (
    <div className="glass rounded-2xl p-5 grid-bg flex flex-col lg:flex-row gap-5 lg:items-center justify-between">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 mb-1.5">
          <Landmark className="w-4 h-4 text-violet-300" />
          <span className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Why this matters</span>
        </div>
        <p className="font-serif-editorial text-lg text-slate-200 leading-snug">
          PolicyPulse is a civic-participation tool: it surfaces the real legislation moving around you and lets anyone
          stress-test a bill on a digital twin of their own community — built from live Census data — to see who it helps
          and who it hurts, <span className="italic text-cyan-200">before it ever becomes law.</span>
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
    <div className="flex items-center gap-2 border border-slate-700/70 rounded-full px-3 py-1.5">
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      <span className="text-[11px] text-slate-300 font-medium">{label}</span>
      <span className="text-[10px] text-slate-500">{s.text}</span>
    </div>
  );
}

function MapLoading() {
  return (
    <div className="w-full h-full rounded-2xl glass grid-bg flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-cyan-300 animate-spin" />
    </div>
  );
}
