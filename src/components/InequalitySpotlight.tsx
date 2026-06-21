"use client";

import { AlertTriangle, ArrowRight, Scale, TrendingDown, TrendingUp } from "lucide-react";
import type { Analysis, GroupMetric } from "@/lib/types";
import { groupColor } from "@/lib/ui";
import { cn, fmtPct } from "@/lib/utils";

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
          <div className="space-y-2.5">
            {byGroup.map((g) => (
              <div key={g.group} className="flex items-center gap-2">
                <span className="w-20 text-[11px] text-slate-300 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: groupColor(g.group) }} />
                  {g.group}
                </span>
                <div className="flex-1 relative h-5">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-slate-700" />
                  <div
                    className={cn("absolute inset-y-0.5 rounded", g.impactScore >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70")}
                    style={{
                      width: `${Math.min(50, (Math.abs(g.impactScore) / 100) * 50)}%`,
                      left: g.impactScore >= 0 ? "50%" : undefined,
                      right: g.impactScore < 0 ? "50%" : undefined,
                    }}
                  />
                </div>
                <span className={cn("w-10 text-right text-[11px] tabular-nums", g.impactScore >= 0 ? "text-emerald-300" : "text-rose-300")}>
                  {g.impactScore > 0 ? "+" : ""}{g.impactScore}
                </span>
              </div>
            ))}
          </div>
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
