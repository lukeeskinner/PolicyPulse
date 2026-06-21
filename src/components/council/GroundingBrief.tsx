"use client";

import { motion } from "framer-motion";
import { Activity, FileText, TrendingDown, TrendingUp } from "lucide-react";
import type { GroundingBrief as Brief } from "@/lib/council/types";
import { cn, fmtPct } from "@/lib/utils";

export function GroundingBrief({ brief }: { brief?: Brief }) {
  if (!brief) {
    return (
      <div className="glass rounded-2xl p-4 grid-bg flex flex-col items-center justify-center text-center min-h-[160px]">
        <span className="w-10 h-10 rounded-xl bg-signal/12 flex items-center justify-center mb-3">
          <Activity className="w-5 h-5 text-signal-bright pp-pulse" />
        </span>
        <p className="text-sm text-slate-400 max-w-[18rem] leading-relaxed">Simulating the bill — the evidence the council debates appears here.</p>
      </div>
    );
  }

  const giniWidened = brief.giniAfter > brief.giniBefore;
  const hurt = brief.whoGetsHurt.slice(0, 3);
  const maxHurt = Math.max(1, ...hurt.map((s) => Math.abs(s.impactScore)));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-signal" />
        <h3 className="eyebrow">The evidence</h3>
        <span className="ml-auto text-[10px] text-slate-500 font-data">{brief.populationLabel}</span>
      </div>

      <p className="text-sm text-slate-200 leading-snug line-clamp-2">{brief.headline}</p>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Stat label="Displaced" value={fmtPct(brief.displacementRate)} tone="bad" />
        <Stat label="Worse off" value={fmtPct(brief.loseShare)} tone="warn" />
        <Stat label="Better off" value={fmtPct(brief.winShare)} tone="good" />
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-ink/40 px-3 py-1.5">
        <span className={cn("flex items-center gap-1 text-[11px] font-data", giniWidened ? "text-rose-400" : "text-emerald-300")}>
          {giniWidened ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          Gini {brief.giniBefore} → {brief.giniAfter}
        </span>
        <span className="text-[11px] text-slate-500">inequality {giniWidened ? "widens" : "narrows"}</span>
      </div>

      {hurt.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-data">Hardest hit</p>
          <div className="space-y-1.5">
            {hurt.map((s) => (
              <div key={s.segment} className="flex items-center gap-2 text-[12px]">
                <span className="text-slate-300 truncate w-28 shrink-0">{s.segment}</span>
                <div className="relative flex-1 h-2 rounded-full bg-ink/70 overflow-hidden">
                  <motion.span className="absolute inset-y-0 left-0 rounded-full bg-rose-400/80" initial={{ width: 0 }} animate={{ width: `${(Math.abs(s.impactScore) / maxHurt) * 100}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
                </div>
                <span className="font-data text-rose-300 shrink-0 tabular-nums w-7 text-right">{s.impactScore}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-amber-300";
  return (
    <div className="rounded-lg border border-line bg-ink/40 px-2.5 py-2 text-center">
      <div className={cn("font-data text-lg leading-none tabular-nums", color)}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-1">{label}</div>
    </div>
  );
}
