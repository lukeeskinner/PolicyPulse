"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { RoundDef, RoundMetrics } from "@/lib/types";
import { cn, fmtPct } from "@/lib/utils";

interface Props {
  metrics: RoundMetrics[];
  rounds: RoundDef[];
  currentRound: number;
  status: "idle" | "running" | "complete" | "error";
}

export function MetricsTimeline({ metrics, rounds, currentRound, status }: Props) {
  const sorted = [...metrics].sort((a, b) => a.round - b.round);
  const baseline = sorted.find((m) => m.round < 0) ?? sorted[0];
  const latest = sorted[sorted.length - 1];

  const series = sorted.map((m) => ({
    label: m.label,
    wellbeing: m.avgWellbeing,
    burden: Math.round(m.avgRentBurden * 100),
    displacement: Math.round(m.displacementRate * 100),
  }));

  const steps = [{ index: -1, label: "Today" }, ...rounds];

  return (
    <div className="glass rounded-2xl p-5">
      {/* round stepper */}
      <div className="flex items-center justify-between mb-5">
        {steps.map((s, i) => {
          const done = currentRound >= s.index && status !== "idle";
          const active = currentRound === s.index;
          return (
            <div key={s.index} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-3 h-3 rounded-full transition-colors",
                    active ? "bg-signal glow-signal pp-pulse" : done ? "bg-signal/70" : "bg-slate-700",
                  )}
                />
                <span className={cn("mt-1.5 font-data text-[10px] whitespace-nowrap", active ? "text-signal-bright" : "text-slate-500")}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn("h-px flex-1 mx-1 mb-4", done ? "bg-signal/50" : "bg-slate-700/60")} />
              )}
            </div>
          );
        })}
      </div>

      {/* metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <MetricCard label="Avg rent burden" value={latest ? fmtPct(latest.avgRentBurden) : "—"} delta={latest && baseline ? latest.avgRentBurden - baseline.avgRentBurden : 0} invert />
        <MetricCard label="Displaced" value={latest ? fmtPct(latest.displacementRate) : "—"} delta={latest && baseline ? latest.displacementRate - baseline.displacementRate : 0} invert />
        <MetricCard label="Avg wellbeing" value={latest ? `${latest.avgWellbeing}` : "—"} delta={latest && baseline ? (latest.avgWellbeing - baseline.avgWellbeing) / 100 : 0} />
        <MetricCard label="Housing supply" value={latest ? `${latest.housingSupplyIndex}` : "—"} delta={latest ? (latest.housingSupplyIndex - 100) / 100 : 0} suffix="" />
      </div>

      {/* trend chart */}
      <div className="h-44">
        {series.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: "var(--body-fg)" }}
              />
              <Line type="monotone" dataKey="wellbeing" name="Wellbeing" stroke="#6e8bff" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="burden" name="Rent burden %" stroke="#fb7185" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="displacement" name="Displaced %" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-600 text-sm">
            Metrics will appear as the simulation runs…
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-400">
        <Legend color="#6e8bff" label="Wellbeing (0–100)" />
        <Legend color="#fb7185" label="Rent burden %" />
        <Legend color="#f59e0b" label="Displaced %" />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  invert,
  suffix,
}: {
  label: string;
  value: string;
  delta: number;
  invert?: boolean;
  suffix?: string;
}) {
  const rising = delta > 0.001;
  const falling = delta < -0.001;
  const good = invert ? falling : rising;
  const bad = invert ? rising : falling;
  return (
    <div className="rounded-xl bg-ink/40 border border-line px-3 py-2.5">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span className="font-data text-lg font-semibold text-slate-100 tabular-nums">{value}{suffix}</span>
        {(rising || falling) && (
          <span className={cn("flex items-center text-[11px]", good ? "text-emerald-400" : bad ? "text-rose-400" : "text-slate-500")}>
            {rising ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {fmtPct(Math.abs(delta))}
          </span>
        )}
        {!rising && !falling && <Minus className="w-3 h-3 text-slate-600" />}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-3 h-0.5 rounded" style={{ background: color }} />
      {label}
    </span>
  );
}
