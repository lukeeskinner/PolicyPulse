"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Cpu, FlaskConical, FlaskRound, Gavel, Ghost, Layers, LineChart, Link2, Map as MapIcon, ScatterChart, Users2 } from "lucide-react";
import { PulseMark, PulseLine } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AgentDrawer } from "@/components/AgentDrawer";
import { AgentGrid } from "@/components/AgentGrid";
import { ContactRep } from "@/components/ContactRep";
import { EventTicker } from "@/components/EventTicker";
import { InequalitySpotlight } from "@/components/InequalitySpotlight";
import { IngestionPanel } from "@/components/IngestionPanel";
import { MetricsTimeline } from "@/components/MetricsTimeline";
import { PolicyConsole } from "@/components/PolicyConsole";
import { stateByName } from "@/lib/states";
import { groupColor, OUTCOME_COLORS, OUTCOME_LABEL, PHASE_LABEL } from "@/lib/ui";
import { useSimulation } from "@/lib/useSimulation";
import { cn } from "@/lib/utils";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.03 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } } };

// The policy text arriving from the Pulse Map is "IDENTIFIER — Title". Split it
// back apart for the email draft; pasted free-text bills have no identifier.
function splitBill(policy: string, modelTitle?: string): { identifier: string; title: string } {
  const m = policy.match(/^(.+?)\s+—\s+(.+)$/);
  if (m) return { identifier: m[1].trim(), title: m[2].trim() };
  return { identifier: "this bill", title: modelTitle || policy.slice(0, 90) };
}

export default function SimulatePage() {
  return (
    <Suspense fallback={null}>
      <SimulateDashboard />
    </Suspense>
  );
}

function SimulateDashboard() {
  const { state, start, reset, loadSnapshot } = useSimulation();
  const [selected, setSelected] = useState<string | null>(null);
  const params = useSearchParams();
  const bridged = useRef(false);
  const loaded = useRef(false);

  // Bridge: a real bill clicked on the Pulse Map arrives as query params and
  // auto-runs against a Census-grounded population for that state.
  const initialPolicy = params.get("policy") ?? undefined;
  const initialJurisdiction = params.get("jurisdiction") ?? params.get("label") ?? undefined;

  // Shareable permalink: ?runId=… cold-loads a finished run's snapshot.
  useEffect(() => {
    if (loaded.current) return;
    const runId = params.get("runId");
    if (!runId) return;
    loaded.current = true;
    void loadSnapshot(runId);
  }, [params, loadSnapshot]);

  useEffect(() => {
    if (bridged.current) return;
    if (params.get("runId")) return; // a shared run takes precedence
    const policy = params.get("policy");
    if (!policy) return;
    bridged.current = true;
    start({
      policy,
      jurisdiction: params.get("jurisdiction") || params.get("label") || "United States",
      agentCount: 60,
      stateCode: params.get("state") || undefined,
    });
  }, [params, start]);

  const active = state.status !== "idle";
  const analysisReady = state.status === "complete" && !!state.analysis;
  // Prefer the analysis's post-finalize per-group metrics (impactScore is only
  // populated at finalize). Fall back to the latest round's group metrics.
  const byGroup =
    (state.analysis?.byGroup?.length ? state.analysis.byGroup : undefined) ??
    [...(state.snapshot?.metricsByRound ?? state.metrics)]
      .sort((a, b) => b.round - a.round)
      .find((m) => m.byGroup.length > 0)?.byGroup ??
    [];

  return (
    <div className="min-h-screen">
      <header className="relative border-b border-line backdrop-blur sticky top-0 z-30 bg-ink/80">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <PulseMark className="w-9 h-9" live={active} />
            <div>
              <h1 className="font-display text-base font-semibold tracking-tight text-slate-50 leading-none group-hover:text-slate-50">
                Policy<span className="text-signal-bright">Pulse</span> <span className="text-slate-600 font-normal">/ Simulator</span>
              </h1>
              <p className="eyebrow mt-1.5">Stress-test a bill on a digital twin</p>
            </div>
          </Link>
          <div className="flex items-center gap-2.5">
            <PhasePill phase={state.phase} status={state.status} round={state.currentRound} />
            {state.status === "complete" && state.runId && <ShareRunButton runId={state.runId} />}
            <NavPill href="/" icon={<MapIcon className="w-3.5 h-3.5" />} label="Pulse Map" />
            <NavPill href="/ghost" icon={<Ghost className="w-3.5 h-3.5" />} label="Ghost" />
            <NavPill href="/council" icon={<Gavel className="w-3.5 h-3.5" />} label="Council" />
            <NavPill href="/lab" icon={<Layers className="w-3.5 h-3.5" />} label="Lab" />
            <NavPill href="/runs" icon={<FlaskRound className="w-3.5 h-3.5" />} label="Runs" />
            <NavPill href="/validate" icon={<FlaskConical className="w-3.5 h-3.5" />} label="Validation" />
            <ThemeToggle />
          </div>
        </div>
        <PulseLine width={2000} height={20} className="absolute inset-x-0 -bottom-px h-5 opacity-70" />
      </header>

      <main className="max-w-[1500px] mx-auto px-4 lg:px-6 py-4 pb-12">
        <div className={cn(!active && "lg:min-h-[calc(100vh-108px)] lg:flex lg:flex-col lg:justify-center")}>
          <motion.div variants={container} initial="hidden" animate="show" className={cn("grid grid-cols-12 gap-4", !active && "lg:items-stretch")}>
            <motion.div variants={item} className="col-span-12 lg:col-span-3 space-y-4 flex flex-col">
              <PolicyConsole
                onRun={(req) => { setSelected(null); start(req); }}
                onReset={() => { setSelected(null); reset(); }}
                status={state.status}
                initialPolicy={initialPolicy}
                initialJurisdiction={initialJurisdiction}
              />
              {(state.policyModel || state.sources.length > 0) && (
                <IngestionPanel policyModel={state.policyModel} profile={state.profile} sources={state.sources} breakdown={state.breakdown} />
              )}
            </motion.div>

            <motion.div variants={item} className="col-span-12 lg:col-span-6 flex flex-col gap-4">
              <StageCard state={state} onSelect={setSelected} selected={selected ?? undefined} />
              {active && (
                <MetricsTimeline metrics={state.metrics} rounds={state.rounds} currentRound={state.currentRound} status={state.status} />
              )}
            </motion.div>

            <motion.div variants={item} className="col-span-12 lg:col-span-3">
              {active ? (
                <div className="lg:sticky lg:top-[72px] h-[520px] lg:h-[calc(100vh-92px)]">
                  <EventTicker items={state.ticker} status={state.status} analysis={state.analysis} />
                </div>
              ) : (
                <TwinPreview />
              )}
            </motion.div>
          </motion.div>
        </div>

        {analysisReady && state.analysis && (
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-4 space-y-4">
            <InequalitySpotlight analysis={state.analysis} byGroup={byGroup} onSelectAgent={setSelected} />
            {(() => {
              const policyText = state.meta?.policy ?? initialPolicy ?? "";
              const jurisdiction = state.meta?.jurisdiction ?? initialJurisdiction ?? "our community";
              const stateCode = params.get("state") || stateByName(jurisdiction)?.abbr || undefined;
              const latParam = params.get("lat");
              const lngParam = params.get("lng");
              const lat = latParam ? Number(latParam) : undefined;
              const lng = lngParam ? Number(lngParam) : undefined;
              const { identifier, title } = splitBill(policyText, state.policyModel?.title);
              return (
                <ContactRep
                  stateCode={stateCode}
                  lat={Number.isFinite(lat) ? lat : undefined}
                  lng={Number.isFinite(lng) ? lng : undefined}
                  jurisdiction={jurisdiction}
                  billIdentifier={identifier}
                  billTitle={title}
                  analysis={state.analysis!}
                />
              );
            })()}
          </motion.div>
        )}
      </main>

      <AgentDrawer runId={state.runId} agentId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function NavPill({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors"
    >
      {icon} {label}
    </Link>
  );
}

function ShareRunButton({ runId }: { runId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = `${window.location.origin}/simulate?runId=${runId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard blocked; fall through to the visual confirmation anyway */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={copy}
      title="Copy a shareable link to this run"
      className={cn(
        "flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border transition-colors",
        copied
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-line text-slate-300 hover:text-signal-bright hover:border-signal/50",
      )}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
      {copied ? "Link copied" : "Share"}
    </button>
  );
}

function PhasePill({ phase, status, round }: { phase: string; status: string; round: number }) {
  if (status === "idle") return null;
  const label = phase === "simulating" && round >= 0 ? `${PHASE_LABEL[phase]}` : PHASE_LABEL[phase] ?? "";
  const done = status === "complete";
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border font-data", done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-signal/40 bg-signal/10 text-signal-bright")}>
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
          <Users2 className="w-4 h-4 text-signal" />
          <h2 className="eyebrow">
            The population
            <span className="font-data text-slate-500 ml-2 tracking-normal normal-case">{state.spawned}/{state.total} residents</span>
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

      <AgentGrid agents={state.agents} total={state.total} onSelect={onSelect} selectedId={selected} groups={state.profile?.groups} />

      {state.status === "complete" && (
        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-line flex-wrap">
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
    <div className="glass rounded-2xl p-8 grid-bg min-h-[360px] lg:h-full flex flex-col justify-center">
      <span className="eyebrow mb-3">The digital twin</span>
      <h2 className="font-display text-2xl font-semibold text-slate-100 leading-tight max-w-lg">
        Every policy creates winners and losers.{" "}
        <span className="font-serif-editorial italic text-signal-bright">See them before you vote.</span>
      </h2>
      <p className="text-sm text-slate-400 mt-3 max-w-xl leading-relaxed">
        PolicyPulse builds a statistically representative population from live U.S. Census data, then makes each resident live through your policy across three years. Watch second-order effects cascade — and see exactly who gets hurt.
      </p>
      <ol className="mt-5 space-y-2 text-sm text-slate-300">
        <Step n={1} text="Pick a real bill from the Pulse Map, or paste your own and choose a state." />
        <Step n={2} text="Live ACS demographics ground the community; Mastra agents model the policy and spawn residents." />
        <Step n={3} text="Residents live through Month 1 → Year 3 as cascading effects ripple out." />
        <Step n={4} text="The inequality spotlight reveals disparities, unintended consequences, and who gets hurt." />
      </ol>
      <p className="text-[11px] text-slate-500 mt-5">Open the Pulse Map to start from a real bill near you →</p>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-5 h-5 rounded-full bg-signal/15 text-signal-bright font-data text-[11px] flex items-center justify-center shrink-0 mt-0.5">{n}</span>
      <span>{text}</span>
    </li>
  );
}

// Idle-state companion to the hero: previews the three surfaces a run reveals,
// so the right rail reads as intent rather than an empty live-feed.
function TwinPreview() {
  return (
    <div className="glass rounded-2xl p-5 grid-bg lg:h-full flex flex-col">
      <span className="eyebrow">What the twin reveals</span>
      <div className="mt-4 space-y-4 flex-1">
        <PreviewRow icon={<Users2 className="w-4 h-4" />} title="A living population" body="A statistically representative community, color-coded by group — each resident with their own story." />
        <PreviewRow icon={<LineChart className="w-4 h-4" />} title="Three-year trajectory" body="Rent burden, displacement, and wellbeing move Month 1 → Year 3 as second-order effects cascade." />
        <PreviewRow icon={<ScatterChart className="w-4 h-4" />} title="The inequality spotlight" body="Who gains, who's displaced, and the unintended consequences — broken out by group." />
      </div>
      <p className="text-[11px] text-slate-600 mt-4 pt-4 border-t border-line leading-relaxed">Grounded in live U.S. Census ACS data · modeled by Mastra agents.</p>
    </div>
  );
}

function PreviewRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-8 h-8 rounded-lg bg-signal/12 text-signal-bright flex items-center justify-center shrink-0">{icon}</span>
      <div>
        <h3 className="text-sm font-medium text-slate-100">{title}</h3>
        <p className="text-[12px] text-slate-400 mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
