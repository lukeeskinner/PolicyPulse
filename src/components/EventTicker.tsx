"use client";

import { Activity, AlertTriangle, Scale, TrendingDown, TrendingUp } from "lucide-react";
import type { TickerItem } from "@/lib/useSimulation";
import type { Analysis } from "@/lib/types";
import { toneClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

interface Props {
  items: TickerItem[];
  status?: "idle" | "running" | "complete" | "error";
  analysis?: Analysis;
}

export function EventTicker({ items, status, analysis }: Props) {
  const live = status === "running";
  // After a run, if no second-order events streamed (e.g. a policy with no
  // housing/employment cascade), surface the run's real results instead of a
  // blank feed. Pulled from the computed analysis — nothing invented.
  const showResults = status === "complete" && items.length === 0 && !!analysis;

  return (
    <div className="glass rounded-2xl p-4 flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <Activity className={`w-4 h-4 text-signal ${live && items.length ? "pp-pulse" : ""}`} />
        <h3 className="eyebrow">{showResults ? "Run results" : "Live feed"}</h3>
        {live && items.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pp-pulse" /> live
          </span>
        )}
        {status === "complete" && items.length > 0 && (
          <span className="ml-auto text-[10px] text-slate-500">{items.length} events</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {items.length === 0 && !showResults && (
          <p className="text-sm text-slate-600">
            Cascading effects and resident events stream here as the policy ripples through the city…
          </p>
        )}

        {items.map((it) => (
          <div key={it.id} className="text-[12px] leading-snug flex gap-2 animate-[pp-pop_0.25s_ease]">
            <span className="font-data text-slate-600 tabular-nums shrink-0">
              {it.round != null && it.round >= 0 ? `R${it.round + 1}` : "·"}
            </span>
            <span className={toneClass(it.tone)}>{it.text}</span>
          </div>
        ))}

        {showResults && analysis && <RunResults analysis={analysis} />}
      </div>
    </div>
  );
}

// Compact, honest results readout drawn from the run's own analysis: no
// second-order cascade fired, so we show the distributional outcome instead.
function RunResults({ analysis }: { analysis: Analysis }) {
  const giniWidened = analysis.giniAfter > analysis.giniBefore;
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-slate-500 leading-snug">
        No displacement or job-loss cascades fired for this policy — here&apos;s how it landed across the
        population.
      </p>

      <div className="rounded-lg bg-ink/40 border border-line p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <Scale className="w-3 h-3 text-signal" />
          <span className="eyebrow">Inequality (Gini)</span>
        </div>
        <div className="flex items-center gap-1.5 text-[12px] font-data tabular-nums">
          <span className="text-slate-300">{analysis.giniBefore.toFixed(2)}</span>
          <span className="text-slate-600">→</span>
          <span className={giniWidened ? "text-rose-400" : "text-emerald-400"}>
            {analysis.giniAfter.toFixed(2)}
          </span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded",
              giniWidened ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300",
            )}
          >
            {giniWidened ? "widened" : "narrowed"}
          </span>
        </div>
      </div>

      {analysis.whoGetsHurt.length > 0 && (
        <ResultList
          title="Who gets hurt"
          icon={<TrendingDown className="w-3 h-3 text-rose-400" />}
          rows={analysis.whoGetsHurt.slice(0, 3).map((s) => ({ label: s.segment, score: s.impactScore }))}
          bad
        />
      )}

      {analysis.winners.length > 0 && (
        <ResultList
          title="Who benefits"
          icon={<TrendingUp className="w-3 h-3 text-emerald-400" />}
          rows={analysis.winners.slice(0, 3).map((s) => ({ label: s.segment, score: s.impactScore }))}
        />
      )}

      {analysis.unintended.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span className="eyebrow">Unintended effects</span>
          </div>
          <div className="space-y-1.5">
            {analysis.unintended.slice(0, 3).map((u, i) => (
              <div key={i} className="rounded-lg bg-ink/40 border border-line p-2">
                <div className="text-[11px] font-semibold text-amber-200">{u.flag}</div>
                <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{u.statement}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultList({
  title,
  icon,
  rows,
  bad,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { label: string; score: number }[];
  bad?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="eyebrow">{title}</span>
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-2 text-[12px]">
            <span className="text-slate-300 leading-snug">{r.label}</span>
            <span
              className={cn(
                "font-data tabular-nums shrink-0",
                bad ? "text-rose-300" : "text-emerald-300",
              )}
            >
              {r.score > 0 ? "+" : ""}
              {r.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
