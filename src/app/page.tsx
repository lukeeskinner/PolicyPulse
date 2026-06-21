"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Cpu, FlaskConical, Users2 } from "lucide-react";
import { AgentDrawer } from "@/components/AgentDrawer";
import { AgentGrid } from "@/components/AgentGrid";
import { EventTicker } from "@/components/EventTicker";
import { InequalitySpotlight } from "@/components/InequalitySpotlight";
import { IngestionPanel } from "@/components/IngestionPanel";
import { MetricsTimeline } from "@/components/MetricsTimeline";
import { PolicyConsole } from "@/components/PolicyConsole";
import { groupColor, OUTCOME_COLORS, OUTCOME_LABEL, PHASE_LABEL } from "@/lib/ui";
import { useSimulation } from "@/lib/useSimulation";
import { cn } from "@/lib/utils";

export default function Home() {
  const { state, start, reset } = useSimulation();
  const [selected, setSelected] = useState<string | null>(null);

  const active = state.status !== "idle";
  const analysisReady = state.status === "complete" && !!state.analysis;
  const byGroup =
    [...(state.snapshot?.metricsByRound ?? state.metrics)]
      .sort((a, b) => b.round - a.round)
      .find((m) => m.byGroup.length > 0)?.byGroup ?? [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800/70 backdrop-blur sticky top-0 z-30 bg-[#05070e]/80">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center">
              <Activity className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-50 leading-none">PolicyPulse</h1>
              <p className="text-[11px] text-slate-400 mt-0.5">A demographic digital twin — simulate a policy, watch the inequality emerge</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <PhasePill phase={state.phase} status={state.status} round={state.currentRound} />
            <Link
              href="/validate"
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-cyan-200 border border-slate-700/70 hover:border-cyan-500/50 rounded-full px-3 py-1.5 transition-colors"
            >
              <FlaskConical className="w-3.5 h-3.5" /> Validation
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-4 lg:px-6 py-4 pb-20">
        <div className="grid grid-cols-12 gap-4">
          {/* left column */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <PolicyConsole onRun={(req) => { setSelected(null); start(req); }} onReset={() => { setSelected(null); reset(); }} status={state.status} />
            {(state.policyModel || state.sources.length > 0) && (
              <IngestionPanel policyModel={state.policyModel} profile={state.profile} sources={state.sources} breakdown={state.breakdown} />
            )}
          </div>

          {/* center column */}
          <div className="col-span-12 lg:col-span-6 space-y-4">
            <StageCard state={state} onSelect={setSelected} selected={selected ?? undefined} />
            {active && (
              <MetricsTimeline metrics={state.metrics} rounds={state.rounds} currentRound={state.currentRound} status={state.status} />
            )}
          </div>

          {/* right column */}
          <div className="col-span-12 lg:col-span-3">
            <div className="lg:sticky lg:top-[72px] h-[520px] lg:h-[calc(100vh-92px)]">
              <EventTicker items={state.ticker} />
            </div>
          </div>
        </div>

        {analysisReady && state.analysis && (
          <div className="mt-4">
            <InequalitySpotlight analysis={state.analysis} byGroup={byGroup} onSelectAgent={setSelected} />
          </div>
        )}
      </main>

      <AgentDrawer runId={state.runId} agentId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function PhasePill({ phase, status, round }: { phase: string; status: string; round: number }) {
  if (status === "idle") return null;
  const label = phase === "simulating" && round >= 0 ? `${PHASE_LABEL[phase]}` : PHASE_LABEL[phase] ?? "";
  const done = status === "complete";
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border", done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-cyan-500/40 bg-cyan-500/10 text-cyan-300")}>
      <Cpu className={cn("w-3.5 h-3.5", !done && "pp-pulse")} />
      {label}
    </div>
  );
}

function StageCard({
  state,
  onSelect,
  selected,
}: {
  state: ReturnType<typeof useSimulation>["state"];
  onSelect: (id: string) => void;
  selected?: string;
}) {
  if (state.status === "idle") return <IdleHero />;
  return (
    <div className="glass rounded-2xl p-5 grid-bg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users2 className="w-4 h-4 text-cyan-300" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-200">
            The population
            <span className="text-slate-500 font-normal ml-2">{state.spawned}/{state.total} residents</span>
          </h2>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap justify-end">
          {Object.keys(state.profile?.groups ?? {}).map((g) => (
            <span key={g} className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: groupColor(g) }} />
              {g}
            </span>
          ))}
        </div>
      </div>

      <AgentGrid agents={state.agents} total={state.total} onSelect={onSelect} selectedId={selected} />

      {state.status === "complete" && (
        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-800/70 flex-wrap">
          {(["better", "stable", "worse", "displaced"] as const).map((o) => {
            const n = state.agents.filter((a) => a.outcome === o).length;
            return (
              <span key={o} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="w-2.5 h-2.5 rounded" style={{ background: OUTCOME_COLORS[o] }} />
                {OUTCOME_LABEL[o]}: <span className="text-slate-200 font-medium">{n}</span>
              </span>
            );
          })}
          <span className="text-[11px] text-slate-500 ml-auto">Click any resident to read their story</span>
        </div>
      )}
    </div>
  );
}

function IdleHero() {
  return (
    <div className="glass rounded-2xl p-8 grid-bg min-h-[360px] flex flex-col justify-center">
      <h2 className="text-2xl font-bold text-slate-100 leading-tight max-w-lg">
        Every policy creates winners and losers.{" "}
        <span className="bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent">See them before you vote.</span>
      </h2>
      <p className="text-sm text-slate-400 mt-3 max-w-xl leading-relaxed">
        PolicyPulse builds a statistically representative population of AI residents for a real U.S. city, then makes each one live through your policy across three years. Watch second-order effects cascade — and see exactly who gets hurt.
      </p>
      <ol className="mt-5 space-y-2 text-sm text-slate-300">
        <Step n={1} text="Paste a bill or pick a preset, choose a city, set the population size." />
        <Step n={2} text="Browserbase ingests the community; Mastra agents model the policy and spawn residents." />
        <Step n={3} text="Residents live through Month 1 → Year 3 as cascading effects ripple out." />
        <Step n={4} text="The inequality spotlight reveals disparities, unintended consequences, and who gets hurt." />
      </ol>
      <p className="text-[11px] text-slate-500 mt-5">Try the Oakland rent control preset to start →</p>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-5 h-5 rounded-full bg-cyan-500/15 text-cyan-300 text-[11px] flex items-center justify-center shrink-0 mt-0.5">{n}</span>
      <span>{text}</span>
    </li>
  );
}
