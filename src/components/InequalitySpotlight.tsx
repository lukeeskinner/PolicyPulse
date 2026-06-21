"use client";

import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, Scale, TrendingDown, TrendingUp, Users2 } from "lucide-react";
import type { Analysis, GroupMetric } from "@/lib/types";
import { groupColor } from "@/lib/ui";
import { cn, fmtPct, fmtUSD } from "@/lib/utils";

interface Props {
  analysis: Analysis;
  byGroup: GroupMetric[];
  onSelectAgent: (id: string) => void;
}

export function InequalitySpotlight({ analysis, byGroup, onSelectAgent }: Props) {
  const giniWidened = analysis.giniAfter > analysis.giniBefore;
  return (
    <div className="space-y-4">
      {/* headline */}
      <div className="glass rounded-2xl p-5 border-l-2 border-l-signal/60">
        <div className="flex items-center gap-2 mb-1.5">
          <Scale className="w-4 h-4 text-signal" />
          <h2 className="eyebrow">The inequality this policy creates</h2>
        </div>
        <p className="text-lg font-semibold text-slate-100 leading-snug">{analysis.headline}</p>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">{analysis.summary}</p>
        <div className="flex items-center gap-2 mt-3 text-xs">
          <span className="text-slate-500">Net-resource inequality (Gini)</span>
          <span className="font-data text-slate-300 tabular-nums">{analysis.giniBefore.toFixed(2)}</span>
          <ArrowRight className="w-3 h-3 text-slate-500" />
          <span className={cn("font-data tabular-nums font-semibold", giniWidened ? "text-rose-400" : "text-emerald-400")}>
            {analysis.giniAfter.toFixed(2)}
          </span>
          <span className={cn("text-[11px] px-1.5 py-0.5 rounded", giniWidened ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300")}>
            {giniWidened ? "widened" : "narrowed"}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* group impact */}
        <div className="glass rounded-2xl p-5">
          <h3 className="eyebrow mb-3">Net impact by demographic</h3>
          <GroupImpactChart byGroup={byGroup} />
          {analysis.disparities.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-line pt-3">
              {analysis.disparities.map((d, i) => (
                <div key={i} className="flex gap-2 text-[12px] text-slate-300 leading-snug">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{d.statement}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* who gets hurt / winners */}
        <div className="glass rounded-2xl p-5">
          <h3 className="eyebrow mb-3 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" /> Who gets hurt
          </h3>
          <div className="space-y-2">
            {analysis.whoGetsHurt.length === 0 && <p className="text-xs text-slate-500">No segment saw a clear net loss.</p>}
            {analysis.whoGetsHurt.map((s) => (
              <Segment key={s.segment} segment={s.segment} score={s.impactScore} story={s.story} agentId={s.sampleAgentId} onSelectAgent={onSelectAgent} bad />
            ))}
          </div>
          {analysis.winners.length > 0 && (
            <>
              <h3 className="eyebrow mt-4 mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Who benefits
              </h3>
              <div className="space-y-2">
                {analysis.winners.map((s) => (
                  <Segment key={s.segment} segment={s.segment} score={s.impactScore} story={s.story} agentId={s.sampleAgentId} onSelectAgent={onSelectAgent} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* per-group breakdown — real metrics for every group, filling the
          results area with dense, legible data instead of empty space */}
      {byGroup.length > 0 && <GroupBreakdown byGroup={byGroup} />}

      {/* unintended consequences */}
      {analysis.unintended.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h3 className="eyebrow mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Unintended consequences
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {analysis.unintended.map((u, i) => (
              <div key={i} className="rounded-xl bg-ink/40 border border-line p-3">
                <div className="text-[12px] font-semibold text-amber-200">{u.flag}</div>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{u.statement}</p>
                <div className="mt-2 h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-amber-400/70" style={{ width: fmtPct(u.magnitude) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Diverging horizontal bar chart of net welfare impact (−100…+100) per group.
// Bars are colored by direction (gain/loss); the group's identity color is on
// the axis label. Honest empty state when there's no group data.
function GroupImpactChart({ byGroup }: { byGroup: GroupMetric[] }) {
  if (byGroup.length === 0) {
    return <p className="text-xs text-slate-500">No per-group data for this run.</p>;
  }
  const data = byGroup.map((g) => ({ group: g.group, impact: g.impactScore }));
  const maxAbs = Math.max(10, ...data.map((d) => Math.abs(d.impact)));
  const height = Math.max(120, data.length * 38);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 4, right: 28, bottom: 4, left: 4 }} barCategoryGap="22%">
          <ReferenceLine x={0} stroke="#475569" />
          <XAxis type="number" domain={[-maxAbs, maxAbs]} hide />
          <YAxis
            type="category"
            dataKey="group"
            width={64}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#cbd5e1" }}
          />
          <Bar dataKey="impact" radius={3} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.group} fill={d.impact >= 0 ? "#34d399" : "#fb7185"} />
            ))}
            <LabelList
              dataKey="impact"
              position="right"
              formatter={(value) => {
                const n = Number(value);
                return n > 0 ? `+${n}` : `${n}`;
              }}
              style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
              fill="#94a3b8"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Dense per-group breakdown table: every group's real outcome metrics. Fills
// the results area below the spotlight with legible data, not decoration.
function GroupBreakdown({ byGroup }: { byGroup: GroupMetric[] }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="eyebrow mb-3 flex items-center gap-1.5">
        <Users2 className="w-3.5 h-3.5 text-signal" /> Per-group breakdown
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="text-slate-500 text-left">
              <th className="font-medium font-data uppercase tracking-wide text-[10px] py-1.5 pr-3">Group</th>
              <th className="font-medium font-data uppercase tracking-wide text-[10px] py-1.5 px-3 text-right">Net impact</th>
              <th className="font-medium font-data uppercase tracking-wide text-[10px] py-1.5 px-3 text-right">Displaced</th>
              <th className="font-medium font-data uppercase tracking-wide text-[10px] py-1.5 px-3 text-right">Rent burden</th>
              <th className="font-medium font-data uppercase tracking-wide text-[10px] py-1.5 px-3 text-right">Wellbeing</th>
              <th className="font-medium font-data uppercase tracking-wide text-[10px] py-1.5 pl-3 text-right">Avg income</th>
            </tr>
          </thead>
          <tbody>
            {byGroup.map((g) => (
              <tr key={g.group} className="border-t border-line">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1.5 text-slate-200">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: groupColor(g.group) }} />
                    {g.group}
                    <span className="text-slate-600 text-[10px]">· {g.count}</span>
                  </span>
                </td>
                <td className={cn("py-2 px-3 text-right tabular-nums font-medium", g.impactScore >= 0 ? "text-emerald-300" : "text-rose-300")}>
                  {g.impactScore > 0 ? "+" : ""}{g.impactScore}
                </td>
                <td className={cn("py-2 px-3 text-right tabular-nums", g.displacementRate > 0 ? "text-rose-300" : "text-slate-400")}>
                  {fmtPct(g.displacementRate)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-300">{fmtPct(g.avgRentBurden)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-slate-300">{g.avgWellbeing}</td>
                <td className="py-2 pl-3 text-right tabular-nums text-slate-300">{fmtUSD(g.avgIncome)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-3">
        Net impact is the mean welfare change (−100…+100) across each group&apos;s residents at Year 3. Rates are end-of-run.
      </p>
    </div>
  );
}

function Segment({
  segment,
  score,
  story,
  agentId,
  onSelectAgent,
  bad,
}: {
  segment: string;
  score: number;
  story: string;
  agentId?: string;
  onSelectAgent: (id: string) => void;
  bad?: boolean;
}) {
  return (
    <div className="rounded-xl bg-ink/40 border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-slate-200">{segment}</span>
        <span className={cn("text-[11px] tabular-nums font-semibold", bad ? "text-rose-300" : "text-emerald-300")}>
          {score > 0 ? "+" : ""}{score}
        </span>
      </div>
      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{story}</p>
      {agentId && (
        <button
          onClick={() => onSelectAgent(agentId)}
          className="mt-1.5 text-[11px] text-signal-bright hover:text-signal flex items-center gap-1"
        >
          Meet a resident <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
