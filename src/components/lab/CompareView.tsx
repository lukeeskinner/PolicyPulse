"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GitCompareArrows } from "lucide-react";
import type { CompareDiff, CompareResult } from "@/lib/types";
import { OUTCOME_LABEL } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { pct1, TOOLTIP_STYLE } from "./labFormat";

const A_COLOR = "#6e8bff";
const B_COLOR = "#c084fc";

interface Props {
  result: CompareResult;
}

function fmtVal(v: number, fmt: CompareDiff["fmt"]): string {
  if (fmt === "pct") return pct1(v);
  if (fmt === "gini") return v.toFixed(3);
  return v.toFixed(1);
}

function fmtDelta(v: number, fmt: CompareDiff["fmt"]): string {
  const sign = v > 0 ? "+" : "";
  if (fmt === "pct") return `${sign}${(v * 100).toFixed(1)} pts`;
  if (fmt === "gini") return `${sign}${v.toFixed(3)}`;
  return `${sign}${v.toFixed(1)}`;
}

export function CompareView({ result }: Props) {
  const { a, b } = result;

  const dispRows = a.bands.displacementRate.map((d, i) => ({
    label: d.label,
    a: +(d.mean * 100).toFixed(2),
    b: +(b.bands.displacementRate[i].mean * 100).toFixed(2),
  }));

  const outcomeRows = a.outcomeShares.map((s, i) => ({
    outcome: OUTCOME_LABEL[s.outcome],
    a: +(s.mean * 100).toFixed(1),
    b: +(b.outcomeShares[i].mean * 100).toFixed(1),
  }));

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 border-l-2 border-l-signal/60">
        <div className="flex items-center gap-2 mb-2">
          <GitCompareArrows className="w-4 h-4 text-signal" />
          <h2 className="eyebrow">Head-to-head · {result.draws} paired runs each</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <SideHeader color={A_COLOR} label={a.label} title={a.policy.title} type={a.policy.type} />
          <SideHeader color={B_COLOR} label={b.label} title={b.policy.title} type={b.policy.type} />
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          Both policies run on the <span className="text-slate-300">same population</span> in each paired draw (common random numbers),
          so differences reflect the policy — not luck.
        </p>
      </div>

      {/* diff table */}
      <div className="glass rounded-2xl p-5">
        <h3 className="eyebrow mb-3">Outcome comparison (Year 3, mean of {result.draws} draws)</h3>
        <div className="space-y-1.5">
          <div className="grid grid-cols-12 gap-2 font-data text-[10px] uppercase tracking-[0.12em] text-slate-500 px-2">
            <span className="col-span-5">Metric</span>
            <span className="col-span-2 text-right">{a.label}</span>
            <span className="col-span-2 text-right">{b.label}</span>
            <span className="col-span-3 text-right">Difference</span>
          </div>
          {result.diffs.map((d) => (
            <div key={d.key} className="grid grid-cols-12 gap-2 items-center rounded-lg bg-ink/40 border border-line px-2 py-2 text-xs">
              <span className="col-span-5 text-slate-200">{d.label}</span>
              <span className={cn("col-span-2 text-right font-data tabular-nums", d.better === "a" ? "text-emerald-300" : "text-slate-300")}>
                {fmtVal(d.a, d.fmt)}
              </span>
              <span className={cn("col-span-2 text-right font-data tabular-nums", d.better === "b" ? "text-emerald-300" : "text-slate-300")}>
                {fmtVal(d.b, d.fmt)}
              </span>
              <span className="col-span-3 text-right flex items-center justify-end gap-1.5">
                <span className="font-data tabular-nums text-slate-400">{fmtDelta(d.delta, d.fmt)}</span>
                <WinnerChip better={d.better} aLabel={a.label} bLabel={b.label} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* displacement trajectory */}
        <div className="glass rounded-2xl p-5">
          <h3 className="eyebrow mb-3">Displacement over time</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dispRows} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
                <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={42} unit="%" />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#e2e8f0" }} formatter={(v) => `${v}%`} />
                <Line dataKey="a" name={a.label} stroke={A_COLOR} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                <Line dataKey="b" name={b.label} stroke={B_COLOR} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legendish a={a.label} b={b.label} />
        </div>

        {/* outcome shares */}
        <div className="glass rounded-2xl p-5">
          <h3 className="eyebrow mb-3">Resident outcomes</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outcomeRows} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="outcome" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={42} unit="%" />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#e2e8f0" }} cursor={{ fill: "rgba(148,163,184,0.06)" }} formatter={(v) => `${v}%`} />
                <Bar dataKey="a" name={a.label} fill={A_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="b" name={b.label} fill={B_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legendish a={a.label} b={b.label} />
        </div>
      </div>

      {/* cohort diffs */}
      <div className="glass rounded-2xl p-5">
        <h3 className="eyebrow mb-3">How each cohort fares under {b.label} vs {a.label}</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={result.cohortDiffs} layout="vertical" margin={{ top: 4, right: 16, left: 96, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="segment" tick={{ fill: "#cbd5e1", fontSize: 11 }} axisLine={false} tickLine={false} width={96} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "#e2e8f0" }}
                cursor={{ fill: "rgba(148,163,184,0.06)" }}
                formatter={(v) => {
                  const n = Number(v);
                  return [`${n > 0 ? "+" : ""}${n} impact pts`, `${b.label} − ${a.label}`];
                }}
              />
              <Bar dataKey="delta" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {result.cohortDiffs.map((c, i) => (
                  <Cell key={i} fill={c.delta >= 0 ? "#34d399" : "#f87171"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Positive (green) = the cohort is better off under <span style={{ color: B_COLOR }}>{b.label}</span>; negative (red) = better off under <span style={{ color: A_COLOR }}>{a.label}</span>.
        </p>
      </div>
    </div>
  );
}

function SideHeader({ color, label, title, type }: { color: string; label: string; title: string; type: string }) {
  return (
    <div className="rounded-xl bg-ink/40 border border-line p-3">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
        <span className="text-sm font-semibold text-slate-100">{label}</span>
        <span className="font-data text-[10px] text-slate-500 ml-auto uppercase">{type.replace(/_/g, " ")}</span>
      </div>
      <p className="text-[12px] text-slate-400 mt-1 leading-snug line-clamp-2">{title}</p>
    </div>
  );
}

function WinnerChip({ better, aLabel, bLabel }: { better: CompareDiff["better"]; aLabel: string; bLabel: string }) {
  if (better === "tie") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">tie</span>;
  const label = better === "a" ? aLabel : bLabel;
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 truncate max-w-[90px]" title={`${label} better`}>{label}</span>;
}

function Legendish({ a, b }: { a: string; b: string }) {
  return (
    <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400">
      <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: A_COLOR }} />{a}</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: B_COLOR }} />{b}</span>
    </div>
  );
}
