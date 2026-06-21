"use client";

import { Activity } from "lucide-react";
import type { TickerItem } from "@/lib/useSimulation";
import { toneClass } from "@/lib/ui";

export function EventTicker({ items }: { items: TickerItem[] }) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-cyan-300" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-200">Live feed</h3>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {items.length === 0 && (
          <p className="text-sm text-slate-600">Cascading effects and resident events stream here as the policy ripples through the city…</p>
        )}
        {items.map((it) => (
          <div key={it.id} className="text-[12px] leading-snug flex gap-2 animate-[pp-pop_0.25s_ease]">
            <span className="text-slate-600 tabular-nums shrink-0">
              {it.round != null && it.round >= 0 ? `R${it.round + 1}` : "·"}
            </span>
            <span className={toneClass(it.tone)}>{it.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
