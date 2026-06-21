"use client";

import { useState } from "react";
import { AlertTriangle, Crosshair, Loader2, MapPin, Search } from "lucide-react";
import type { LocationError, UserArea } from "@/lib/civic";

interface LocationBadgeProps {
  area: UserArea | null;
  locating: boolean;
  error: LocationError | null;
  onSearch: (q: string) => void;
  onUseLocation: () => void;
}

export function LocationBadge({ area, locating, error, onSearch, onUseLocation }: LocationBadgeProps) {
  // `null` = follow the error (auto-open search when locating fails — it's the
  // reliable fallback); a boolean = an explicit user toggle that wins.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [q, setQ] = useState("");

  const open = manualOpen ?? !!error;

  const submit = () => {
    if (!q.trim()) return;
    onSearch(q);
    setManualOpen(null); // let the result (error cleared or re-set) drive visibility
  };

  const showError = !!error && !locating;

  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={() => setManualOpen(!open)}
        className={`flex items-center gap-2 text-sm border rounded-full pl-3 pr-3 py-1.5 transition-colors ${
          showError
            ? "text-amber-200 border-amber-400/40 hover:border-amber-300/60"
            : "text-slate-200 border-line hover:border-signal/50"
        }`}
      >
        {locating ? (
          <Loader2 className="w-3.5 h-3.5 text-signal-bright animate-spin" />
        ) : showError ? (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
        ) : (
          <MapPin className="w-3.5 h-3.5 text-signal-bright" />
        )}
        <span className="font-medium">{locating ? "Finding you…" : area ? area.label : "Set your area"}</span>
      </button>

      {open && (
        <div className="flex items-center gap-1.5">
          <div className="search-pill flex items-center gap-1.5 border border-line focus-within:border-signal/50 focus-within:ring-2 focus-within:ring-signal/40 rounded-full pl-3 pr-1.5 py-1 bg-surface/80 transition-colors">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="ZIP or city"
              className="bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none w-28"
            />
            <button
              onClick={submit}
              className="text-[11px] text-ink bg-signal hover:bg-signal-bright rounded-full px-2.5 py-1 font-medium transition-colors"
            >
              Go
            </button>
          </div>
          <button
            onClick={() => {
              onUseLocation();
              setManualOpen(null);
            }}
            title="Use my location"
            className="flex items-center justify-center w-8 h-8 border border-line hover:border-signal/50 rounded-full text-slate-300 hover:text-signal-bright transition-colors"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showError && (
        <div className="absolute top-full right-0 mt-2 w-72 z-40 glass rounded-xl border border-amber-400/30 px-3 py-2.5 flex items-start gap-2 shadow-lg">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <p className="text-[12px] leading-relaxed text-slate-200">{error.message}</p>
        </div>
      )}
    </div>
  );
}
