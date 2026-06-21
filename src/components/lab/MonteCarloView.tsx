"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dices, TrendingDown } from "lucide-react";
import type { MetricBand, MonteCarloResult, Outcome } from "@/lib/types";
import { OUTCOME_COLORS, OUTCOME_LABEL } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { pct1, TOOLTIP_STYLE } from "./labFormat";

interface Props {
  result: MonteCarloResult;
}

export function MonteCarloView({ result }: Props) {
  const finalIdx = result.bands.displacementRate.length - 1;
  const disp = result.bands.displacementRate[finalIdx];
  const burden = result.bands.avgRentBurden[finalIdx];
  const supply = result.bands.housingSupplyIndex[finalIdx];

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 border-l-2 border-l-signal/60">
        <div className="flex items-center gap-2 mb-1.5">
          <Dices className="w-4 h-4 text-signal" />
          <h2 className="eyebrow">Monte Carlo · {result.draws} independent runs</h2>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
          A single simulation is one roll of the dice. Re-running <span className="text-slate-100 font-medium">{result.policy.title}</span>{" "}
          across {result.draws} seeded populations turns each point estimate into a distribution — the shaded bands
          below are the 10th–90th percentile range, the line is the mean.
        </p>
      </div>

      {/* headline stats with ranges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Displaced (Yr 3)" mean={pct1(disp.mean)} lo={pct1(disp.p10)} hi={pct1(disp.p90)} tone="bad" />
        <StatCard label="Avg rent burden (Yr 3)" mean={pct1(burden.mean)} lo={pct1(burden.p10)} hi={pct1(burden.p90)} />
        <StatCard label="Housing supply (Yr 3)" mean={`${supply.mean}`} lo={`${supply.p10}`} hi={`${supply.p90}`} />
        <StatCard label="Inequality (Gini)" mean={result.giniAfter.mean.toFixed(3)} lo={result.giniAfter.p10.toFixed(3)} hi={result.giniAfter.p90.toFixed(3)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <BandChartCard title="Displacement rate over time" data={result.bands.displacementRate} color="#f59e0b" kind="pct" />
        <BandChartCard title="Average rent burden over time" data={result.bands.avgRentBurden} color="#fb7185" kind="pct" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <OutcomeDistribution result={result} />
        <CohortRisk result={result} />
      </div>
    </div>
  );
}

function StatCard({ label, mean, lo, hi, tone }: { label: string; mean: string; lo: string; hi: string; tone?: "bad" }) {
  return (
    <div className="rounded-xl bg-ink/40 border border-line px-3 py-2.5">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className={cn("font-data text-xl font-semibold tabular-nums mt-0.5", tone === "bad" ? "text-amber-200" : "text-slate-100")}>{mean}</div>
      <div className="text-[10px] text-slate-500 font-data mt-0.5">80% range {lo} – {hi}</div>
    </div>
  );
}

interface BandRow {
  label: string;
  mean: number;
  band: [number, number];
  lo: number;
  hi: number;
}

function BandChartCard({ title, data, color, kind }: { title: string; data: MetricBand[]; color: string; kind: "pct" | "raw" }) {
  const scale = (v: number) => (kind === "pct" ? +(v * 100).toFixed(2) : v);
  const rows: BandRow[] = data.map((d) => ({
    label: d.label,
    mean: scale(d.mean),
    lo: scale(d.p10),
    hi: scale(d.p90),
    band: [scale(d.p10), scale(d.p90)],
  }));
  const unit = kind === "pct" ? "%" : "";
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="eyebrow mb-3">{title}</h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
            <Tooltip content={<BandTooltip unit={unit} />} />
            <Area dataKey="band" stroke="none" fill={color} fillOpacity={0.16} isAnimationActive={false} />
            <Line dataKey="mean" stroke={color} strokeWidth={2} dot={{ r: 2, fill: color }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Shaded = 10th–90th percentile across draws · line = mean</p>
    </div>
  );
}

function BandTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { payload: BandRow }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2 text-slate-200">
      <div className="text-slate-100 font-medium mb-0.5">{label}</div>
      <div className="font-data tabular-nums">mean {row.mean}{unit}</div>
      <div className="font-data tabular-nums text-slate-400">range {row.lo}{unit} – {row.hi}{unit}</div>
    </div>
  );
}

function OutcomeDistribution({ result }: { result: MonteCarloResult }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="eyebrow mb-3">Outcome distribution</h3>
      <div className="space-y-2.5">
        {result.outcomeShares.map((s) => (
          <div key={s.outcome} className="flex items-center gap-2.5">
            <span className="w-20 text-[11px] text-slate-300 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: OUTCOME_COLORS[s.outcome as Outcome] }} />
              {OUTCOME_LABEL[s.outcome as Outcome]}
            </span>
            <div className="flex-1 relative h-4 rounded bg-ink/60 overflow-hidden">
              {/* 10–90 range track */}
              <div
                className="absolute inset-y-0 bg-slate-600/40"
                style={{ left: `${s.p10 * 100}%`, width: `${Math.max(0, (s.p90 - s.p10) * 100)}%` }}
              />
              {/* mean fill */}
              <div
                className="absolute inset-y-0 left-0 rounded-r"
                style={{ width: `${s.mean * 100}%`, background: OUTCOME_COLORS[s.outcome as Outcome], opacity: 0.85 }}
              />
            </div>
            <span className="w-24 text-right text-[11px] tabular-nums text-slate-300 font-data">
              {pct1(s.mean)} <span className="text-slate-500">±{pct1((s.p90 - s.p10) / 2)}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-3">Bar = mean share of residents · grey band = 10th–90th percentile</p>
    </div>
  );
}

function CohortRisk({ result }: { result: MonteCarloResult }) {
  const max = Math.max(50, ...result.cohorts.map((c) => Math.abs(c.meanImpact)));
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="eyebrow mb-3 flex items-center gap-1.5">
        <TrendingDown className="w-3.5 h-3.5 text-rose-400" /> Who bears the risk
      </h3>
      <div className="space-y-2.5">
        {result.cohorts.map((c) => (
          <div key={c.segment} className="flex items-center gap-2">
            <span className="w-32 text-[11px] text-slate-300 truncate" title={c.segment}>{c.segment}</span>
            <div className="flex-1 relative h-5">
              <div className="absolute inset-y-0 left-1/2 w-px bg-slate-700" />
              <div
                className={cn("absolute inset-y-1 rounded", c.meanImpact >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70")}
                style={{
                  width: `${Math.min(50, (Math.abs(c.meanImpact) / max) * 50)}%`,
                  left: c.meanImpact >= 0 ? "50%" : undefined,
                  right: c.meanImpact < 0 ? "50%" : undefined,
                }}
              />
            </div>
            <span className={cn("w-9 text-right text-[11px] tabular-nums", c.meanImpact >= 0 ? "text-emerald-300" : "text-rose-300")}>
              {c.meanImpact > 0 ? "+" : ""}{Math.round(c.meanImpact)}
            </span>
            <span className="w-16 text-right text-[10px] tabular-nums text-amber-300/80" title="Probability of displacement">
              {pct1(c.displacementProb)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-3">Mean welfare impact (−100…+100) · right column = displacement probability</p>
    </div>
  );
}
