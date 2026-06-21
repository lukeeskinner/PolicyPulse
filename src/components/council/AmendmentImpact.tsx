"use client";

import { motion } from "framer-motion";
import { ArrowRight, FlaskConical } from "lucide-react";
import type { AmendmentImpact as Impact, ImpactSnapshot } from "@/lib/council/types";
import { cn, fmtPct } from "@/lib/utils";

interface SeatLite {
  id: string;
  name: string;
  color: string;
}

interface Metric {
  label: string;
  before: number;
  after: number;
  fmt: "pct" | "num";
  good: "up" | "down";
}

function metrics(b: ImpactSnapshot, a: ImpactSnapshot): (Metric & { delta: number; improved: boolean; mag: number })[] {
  const raw: Metric[] = [
    { label: "Better off", before: b.winShare, after: a.winShare, fmt: "pct", good: "up" },
    { label: "Displaced", before: b.displacementRate, after: a.displacementRate, fmt: "pct", good: "down" },
    { label: "Worse off", before: b.loseShare, after: a.loseShare, fmt: "pct", good: "down" },
    { label: "Gini", before: b.giniAfter, after: a.giniAfter, fmt: "num", good: "down" },
  ];
  return raw.map((m) => {
    const delta = m.after - m.before;
    const improved = m.good === "down" ? delta < -1e-6 : delta > 1e-6;
    return { ...m, delta, improved, mag: Math.abs(delta) };
  });
}

const fmtV = (n: number, fmt: "pct" | "num") => (fmt === "pct" ? fmtPct(n) : n.toFixed(2));

export function AmendmentImpact({ impact, stakeholders }: { impact?: Impact; stakeholders: SeatLite[] }) {
  if (!impact) return null;
  const colorOf = (id: string) => stakeholders.find((s) => s.id === id)?.color ?? "#94a3b8";
  const nameOf = (id: string) => stakeholders.find((s) => s.id === id)?.name ?? id;

  const ms = metrics(impact.before, impact.after);
  const featured = [...ms].sort((x, y) => y.mag - x.mag)[0];
  const rest = ms.filter((m) => m.label !== featured.label);
  const maxDelta = Math.max(8, ...impact.byStakeholder.map((d) => Math.abs(d.delta)));

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="glass rounded-2xl p-4 grid-bg">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-signal pp-pulse" />
        <h3 className="eyebrow">Re-tested on the twin</h3>
        <span className="ml-auto text-[10px] text-slate-500 font-data">same population &amp; seed · measured</span>
      </div>

      {/* Featured mover — the headline result, large */}
      <div className="mt-3 rounded-xl border border-line bg-ink/40 p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-data">{featured.label}</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-data text-xl text-slate-500 tabular-nums">{fmtV(featured.before, featured.fmt)}</span>
            <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
            <span className={cn("font-data text-4xl leading-none tabular-nums", featured.improved ? "text-emerald-300" : featured.mag < 1e-6 ? "text-slate-300" : "text-rose-300")}>
              {fmtV(featured.after, featured.fmt)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 max-w-[55%]">
          {impact.adopted.map((a) => (
            <span key={a.id} className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">{a.title}</span>
          ))}
        </div>
      </div>

      {/* Secondary movers — compact */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        {rest.map((m) => (
          <div key={m.label} className="rounded-lg border border-line bg-ink/30 px-2.5 py-1.5">
            <div className="text-[10px] text-slate-500">{m.label}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="font-data text-[11px] text-slate-500 tabular-nums">{fmtV(m.before, m.fmt)}</span>
              <ArrowRight className="w-2.5 h-2.5 text-slate-600" />
              <span className={cn("font-data text-sm tabular-nums", m.improved ? "text-emerald-300" : m.mag < 1e-6 ? "text-slate-300" : "text-rose-300")}>{fmtV(m.after, m.fmt)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Who the amendment moved — diverging bars from a center baseline */}
      {impact.byStakeholder.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 font-data">Who the amendment moved · welfare Δ</p>
          <div className="space-y-1.5">
            {impact.byStakeholder.map((d) => (
              <DivergeRow key={d.stakeholderId} name={nameOf(d.stakeholderId)} color={colorOf(d.stakeholderId)} delta={d.delta} max={maxDelta} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function DivergeRow({ name, color, delta, max }: { name: string; color: string; delta: number; max: number }) {
  const pct = (Math.min(Math.abs(delta), max) / max) * 50;
  const pos = delta >= 0;
  const barColor = delta === 0 ? "#64748b" : pos ? "#34d399" : "#fb7185";
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-slate-300 truncate w-24 shrink-0">{name}</span>
      <div className="relative flex-1 h-3">
        <span className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-600" />
        <motion.span
          className="absolute top-0.5 bottom-0.5 rounded"
          style={{ background: barColor, ...(pos ? { left: "50%" } : { right: "50%" }) }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span className={cn("font-data text-[11px] tabular-nums shrink-0 w-10 text-right", delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-500")}>
        {delta > 0 ? "+" : ""}{delta}
      </span>
    </div>
  );
}
