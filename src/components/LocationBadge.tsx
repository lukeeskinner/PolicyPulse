"use client";

import { useState } from "react";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import type { UserArea } from "@/lib/civic";

interface LocationBadgeProps {
  area: UserArea | null;
  locating: boolean;
  onSearch: (q: string) => void;
  onUseLocation: () => void;
}

export function LocationBadge({ area, locating, onSearch, onUseLocation }: LocationBadgeProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const submit = () => {
    if (!q.trim()) return;
    onSearch(q);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-slate-200 border border-line hover:border-signal/50 rounded-full pl-3 pr-3 py-1.5 transition-colors"
      >
        {locating ? (
          <Loader2 className="w-3.5 h-3.5 text-signal-bright animate-spin" />
        ) : (
          <MapPin className="w-3.5 h-3.5 text-signal-bright" />
        )}
        <span className="font-medium">
          {locating ? "Finding you…" : area ? area.label : "Set your area"}
        </span>
      </button>

      {open && (
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 border border-line focus-within:border-signal/50 rounded-full pl-3 pr-1.5 py-1 bg-surface/80 transition-colors">
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
              setOpen(false);
            }}
            title="Use my location"
            className="flex items-center justify-center w-8 h-8 border border-line hover:border-signal/50 rounded-full text-slate-300 hover:text-signal-bright transition-colors"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
