"use client";

import Link from "next/link";
import { FlaskConical, Ghost, Map as MapIcon, Radio } from "lucide-react";
import { PulseLine, PulseMark } from "@/components/Brand";
import { AgentPanels } from "@/components/ghost/AgentPanels";
import { CrisisHud } from "@/components/ghost/CrisisHud";
import { IntegrationRail } from "@/components/ghost/IntegrationRail";
import { NarrationFeed } from "@/components/ghost/NarrationFeed";
import { NegotiationBus } from "@/components/ghost/NegotiationBus";
import { PostMortem } from "@/components/ghost/PostMortem";
import { ScenarioConsole } from "@/components/ghost/ScenarioConsole";
import { WorkflowViz } from "@/components/ghost/WorkflowViz";
import { WorldGraph } from "@/components/ghost/WorldGraph";
import { NODE_COLORS, NODE_LABEL } from "@/lib/ghost/ui";
import { useGhost, type GhostPhase } from "@/lib/ghost/useGhost";
import type { NodeStatus } from "@/lib/ghost/types";
import { cn } from "@/lib/utils";

const LEGEND: NodeStatus[] = ["online", "offline", "compromised", "isolated", "restored"];

export default function GhostPage() {
  const { state, start, reset, voice, setVoice } = useGhost(true);
  const active = state.status !== "idle";
  const running = state.status === "running";
  const voiceLabel = state.integrations?.deepgram ? "Deepgram Aura" : "Browser voice";
  const agentsLite = state.agents.map((a) => ({ id: a.id, name: a.name, color: a.color }));
  const showPostMortem = !!state.postMortem && state.status === "complete";

  return (
    <div className="min-h-screen">
      <header className="relative border-b border-line backdrop-blur sticky top-0 z-30 bg-ink/80">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <PulseMark className="w-9 h-9" live={running} />
            <div>
              <h1 className="font-display text-base font-semibold tracking-tight text-slate-50 leading-none group-hover:text-white flex items-center gap-1.5">
                <Ghost className="w-4 h-4 text-signal-bright" /> Ghost<span className="text-signal-bright">Protocol</span>
              </h1>
              <p className="eyebrow mt-1.5">Watch AI agents resolve a live crisis</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <PhasePill phase={state.phase} />
            <Link href="/" className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
              <MapIcon className="w-3.5 h-3.5" /> Pulse Map
            </Link>
            <Link href="/simulate" className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
              <FlaskConical className="w-3.5 h-3.5" /> Simulator
            </Link>
          </div>
        </div>
        <PulseLine width={2000} height={20} className="absolute inset-x-0 -bottom-px h-5 opacity-70" />
      </header>

      <main className="max-w-[1500px] mx-auto px-4 lg:px-6 py-4 pb-20">
        <div className="grid grid-cols-12 gap-4">
          {/* left rail */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            <ScenarioConsole
              onDeploy={(prompt, scenarioId) => start({ prompt, scenarioId, voice })}
              onReset={reset}
              running={running}
              voice={voice}
              onToggleVoice={() => setVoice(!voice)}
            />
            {state.agents.length > 0 && <AgentPanels agents={state.agents} />}
            <IntegrationRail integrations={state.integrations} compact />
          </div>

          {/* center stage */}
          <div className="col-span-12 lg:col-span-6 space-y-4">
            {!active ? (
              <IdleHero />
            ) : (
              <>
                <CrisisHud
                  metrics={state.metrics}
                  secondsRemaining={state.secondsRemaining}
                  timeLimit={state.timeLimit}
                  running={running}
                  outcome={state.outcome}
                />
                <GraphCard
                  title={state.scenario?.title ?? "Crisis world"}
                  threat={state.scenario?.threatType}
                  nodesCount={state.nodes.length}
                >
                  <WorldGraph nodes={state.nodes} />
                </GraphCard>
                <NegotiationBus messages={state.messages} agents={agentsLite} />
              </>
            )}
          </div>

          {/* right rail */}
          <div className="col-span-12 lg:col-span-3">
            {!active ? (
              <WatchTeaser integrations={!!state.integrations} />
            ) : (
              <div className="lg:sticky lg:top-[72px] flex flex-col gap-4 lg:h-[calc(100vh-92px)]">
                <WorkflowViz workflow={state.workflow} tick={state.workflowTick} running={running} orkes={state.orkes} />
                <NarrationFeed narrations={state.narrations} voice={voice} onToggleVoice={() => setVoice(!voice)} voiceLabel={voiceLabel} />
              </div>
            )}
          </div>
        </div>

        {showPostMortem && state.postMortem && (
          <div className="mt-4">
            <PostMortem postMortem={state.postMortem} agents={state.agents} />
          </div>
        )}

        {state.status === "error" && (
          <div className="mt-4 glass rounded-2xl p-4 border-rose-500/30 text-rose-300 text-sm">
            {state.error ?? "The scenario failed to run."}
          </div>
        )}
      </main>
    </div>
  );
}

function PhasePill({ phase }: { phase: GhostPhase }) {
  if (phase === "idle") return null;
  const label: Record<GhostPhase, string> = {
    idle: "",
    parsing: "Parsing scenario",
    grounding: "Grounding threat intel",
    deploying: "Deploying agents",
    running: "Crisis live",
    resolved: "Resolved",
    error: "Error",
  };
  const done = phase === "resolved";
  const err = phase === "error";
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border font-data",
        err ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-signal/40 bg-signal/10 text-signal-bright",
      )}
    >
      <Radio className={cn("w-3.5 h-3.5", !done && !err && "pp-pulse")} />
      {label[phase]}
    </div>
  );
}

function GraphCard({ title, threat, nodesCount, children }: { title: string; threat?: string; nodesCount: number; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4 grid-bg">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="font-display text-base text-slate-100 leading-tight">{title}</h2>
          {threat && <p className="text-[11px] text-slate-500 mt-0.5">Threat: {threat}</p>}
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 justify-end max-w-[55%]">
          {LEGEND.map((s) => (
            <span key={s} className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{ background: NODE_COLORS[s] }} />
              {NODE_LABEL[s]}
            </span>
          ))}
        </div>
      </div>
      <div className="w-full aspect-[4/3] max-h-[460px]">{children}</div>
      <p className="text-[10px] text-slate-600 mt-1 text-right font-data">{nodesCount} nodes · Simular agents act on this world via structured JSON</p>
    </div>
  );
}

function IdleHero() {
  return (
    <div className="glass rounded-2xl p-8 grid-bg min-h-[420px] flex flex-col justify-center">
      <span className="eyebrow mb-3">A world that breaks — and agents that fix it</span>
      <h2 className="font-display text-2xl font-semibold text-slate-100 leading-tight max-w-lg">
        Type a crisis. Deploy the agents.{" "}
        <span className="font-serif-editorial italic text-signal-bright">Watch them think, negotiate, and resolve it — live.</span>
      </h2>
      <p className="text-sm text-slate-400 mt-3 max-w-xl leading-relaxed">
        Ghost Protocol spins up a structured world, drops a team of specialist AI agents into it, and renders their reasoning, negotiation, and resolution in real time — narrated by voice, traced for explainability, orchestrated visibly. There is no chatbot. There is a system that breaks, and agents that fix it.
      </p>
      <ol className="mt-5 space-y-2 text-sm text-slate-300">
        <Step n={1} text="Describe a crisis — a failing power grid, a hijacked water plant, a fleet with cascading sensor failures." />
        <Step n={2} text="Specialist Fetch.ai agents deploy, each reasoning with Claude, observing and acting on the live world." />
        <Step n={3} text="When they disagree, they negotiate on a structured bus — and a hospital-protection veto changes the plan." />
        <Step n={4} text="Every decision is traced. The post-mortem shows exactly why the agents made the call they made." />
      </ol>
      <p className="text-[11px] text-slate-500 mt-5">Pick a scenario on the left and hit Deploy →</p>
    </div>
  );
}

function WatchTeaser({ integrations }: { integrations: boolean }) {
  return (
    <div className="glass rounded-2xl p-5 grid-bg">
      <span className="eyebrow">What you&apos;ll watch</span>
      <ul className="mt-3 space-y-3 text-sm text-slate-300">
        <Teaser title="The world graph" body="Failing nodes turn red; a countdown ticks toward blackout." />
        <Teaser title="The agent team" body="GridAgent, SecurityAgent, and CommsAgent reason and act in parallel." />
        <Teaser title="The negotiation" body="A vetoed load-shed protects a hospital — no human makes the call." />
        <Teaser title="The post-mortem" body="An Arize-style trace of every decision: what each agent considered and rejected." />
      </ul>
      {!integrations && <p className="text-[11px] text-slate-600 mt-4">Sponsor integrations light up as keys are added — the demo runs fully without them.</p>}
    </div>
  );
}

function Teaser({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="w-1.5 h-1.5 rounded-full bg-signal mt-1.5 shrink-0" />
      <span>
        <span className="text-slate-100 font-medium">{title}.</span> <span className="text-slate-400">{body}</span>
      </span>
    </li>
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
