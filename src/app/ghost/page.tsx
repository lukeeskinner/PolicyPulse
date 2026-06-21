"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, FlaskConical, Gavel, Ghost, Map as MapIcon, MessagesSquare, Network, Radio, ShieldCheck } from "lucide-react";
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
import { PROMPT_EXAMPLES } from "@/lib/ghost/scenarios";
import { NODE_COLORS, NODE_LABEL } from "@/lib/ghost/ui";
import { useGhost, type GhostPhase } from "@/lib/ghost/useGhost";
import type { NodeStatus } from "@/lib/ghost/types";
import { cn } from "@/lib/utils";

const LEGEND: NodeStatus[] = ["online", "offline", "compromised", "isolated", "restored"];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.03 } } };
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function GhostPage() {
  const { state, start, reset, voice, setVoice } = useGhost(true);
  const [prompt, setPrompt] = useState(PROMPT_EXAMPLES[0].prompt);
  const active = state.status !== "idle";
  const running = state.status === "running";
  const voiceLabel = state.integrations?.deepgram ? "Deepgram Aura" : "Browser voice";
  const agentsLite = state.agents.map((a) => ({ id: a.id, name: a.name, color: a.color }));
  const showPostMortem = !!state.postMortem && state.status === "complete";

  const consoleProps = {
    prompt,
    onPromptChange: setPrompt,
    onDeploy: (p: string) => start({ prompt: p, voice }),
    onReset: () => {
      reset();
      setPrompt(PROMPT_EXAMPLES[0].prompt);
    },
    running,
    voice,
    onToggleVoice: () => setVoice(!voice),
  };

  return (
    <div className="min-h-screen relative">
      <CrisisAtmosphere phase={state.phase} />

      <header className="relative z-20 border-b border-line backdrop-blur sticky top-0 bg-ink/80">
        <div className="max-w-[1560px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <PulseMark className="w-9 h-9" live={running} />
            <div>
              <h1 className="font-display text-base font-semibold tracking-tight text-slate-50 leading-none group-hover:text-white flex items-center gap-1.5">
                <Ghost className="w-4 h-4 text-signal-bright" /> Ghost<span className="text-signal-bright">Protocol</span>
              </h1>
              <p className="eyebrow mt-1.5">A crisis, resolved by agents — live</p>
            </div>
          </Link>
          <div className="flex items-center gap-2.5">
            <PhasePill phase={state.phase} />
            <Link href="/" className="hidden md:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
              <MapIcon className="w-3.5 h-3.5" /> Pulse Map
            </Link>
            <Link href="/simulate" className="hidden md:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
              <FlaskConical className="w-3.5 h-3.5" /> Simulator
            </Link>
            <Link href="/council" className="hidden md:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
              <Gavel className="w-3.5 h-3.5" /> Council
            </Link>
          </div>
        </div>
        <PulseLine width={2200} height={20} className="absolute inset-x-0 -bottom-px h-5 opacity-70" />
      </header>

      <main className="relative z-10 max-w-[1560px] mx-auto px-4 lg:px-6 py-4">
        {!active ? (
          <IdleConsole consoleProps={consoleProps} integrations={state.integrations} />
        ) : (
          <Cockpit state={state} consoleProps={consoleProps} agentsLite={agentsLite} voice={voice} setVoice={setVoice} voiceLabel={voiceLabel} running={running} />
        )}

        <AnimatePresence>
          {showPostMortem && state.postMortem && (
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="mt-4">
              <PostMortem postMortem={state.postMortem} agents={state.agents} />
            </motion.div>
          )}
        </AnimatePresence>

        {state.status === "error" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 glass rounded-2xl p-4 border border-rose-500/30 text-rose-300 text-sm">
            {state.error ?? "The scenario failed to run."}
          </motion.div>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambient atmosphere — a faint wash that reddens while the crisis is live and
// settles to green once resolved. Pure ambiance; respects reduced motion.
// ---------------------------------------------------------------------------
function CrisisAtmosphere({ phase }: { phase: GhostPhase }) {
  const reduce = useReducedMotion();
  const live = phase === "running" || phase === "deploying" || phase === "grounding" || phase === "parsing";
  const resolved = phase === "resolved";
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(70rem 44rem at 50% -12%, rgba(239,68,68,0.13), transparent 60%)" }}
        animate={{ opacity: live && phase === "running" ? 1 : live ? 0.45 : 0 }}
        transition={{ duration: reduce ? 0 : 1.4, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(70rem 44rem at 50% -12%, rgba(52,211,153,0.12), transparent 60%)" }}
        animate={{ opacity: resolved ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 1.4, ease: "easeInOut" }}
      />
    </div>
  );
}

function PhasePill({ phase }: { phase: GhostPhase }) {
  const label: Record<GhostPhase, string> = {
    idle: "",
    parsing: "Parsing scenario",
    grounding: "Grounding threat intel",
    deploying: "Designing the world",
    running: "Crisis live",
    resolved: "Resolved",
    error: "Error",
  };
  const done = phase === "resolved";
  const err = phase === "error";
  return (
    <AnimatePresence mode="wait">
      {phase !== "idle" && (
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border font-data whitespace-nowrap",
            err ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-signal/40 bg-signal/10 text-signal-bright",
          )}
        >
          <Radio className={cn("w-3.5 h-3.5", !done && !err && "pp-pulse")} />
          {label[phase]}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Idle — one cohesive composition: hero (thesis + console), a watch strip, and
// the integration footer. Fills the width; no ragged columns.
// ---------------------------------------------------------------------------
type ConsoleProps = Omit<React.ComponentProps<typeof ScenarioConsole>, "className">;

function IdleConsole({ consoleProps, integrations }: { consoleProps: ConsoleProps; integrations?: Parameters<typeof IntegrationRail>[0]["integrations"] }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 lg:min-h-[calc(100vh-108px)] lg:flex lg:flex-col lg:justify-center">
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-7 glass grid-bg rounded-2xl p-8 flex flex-col justify-center relative overflow-hidden min-h-[460px]">
          <PulseLine width={1400} height={16} className="absolute inset-x-0 top-6 h-4 opacity-30" />
          <span className="eyebrow mb-3">A world that breaks — and agents that fix it</span>
          <h2 className="font-display text-3xl lg:text-[2.6rem] font-semibold text-slate-100 leading-[1.05] max-w-xl">
            Type a crisis.{" "}
            <span className="font-serif-editorial italic text-signal-bright">Watch agents think, negotiate, and resolve it</span>{" "}
            — live.
          </h2>
          <p className="text-sm text-slate-400 mt-4 max-w-lg leading-relaxed">
            Ghost Protocol turns your prompt into a structured world, drops a team of specialist AI agents into it, and renders their reasoning, negotiation, and resolution in real time. No chatbot — a system that breaks and agents that fix it.
          </p>
          <ol className="mt-6 space-y-2.5 text-sm text-slate-300 max-w-lg">
            <Step n={1} text="Describe a crisis — a failing grid, a hijacked water plant, a fleet losing its sensors." />
            <Step n={2} text="Claude designs the world from your prompt and live CISA threat intel." />
            <Step n={3} text="Agents reason and act each tick; a critical-infrastructure veto can change the plan." />
            <Step n={4} text="Every decision is traced — the post-mortem shows what each agent considered and rejected." />
          </ol>
        </div>
        <div className="lg:col-span-5 flex">
          <ScenarioConsole {...consoleProps} className="w-full flex flex-col" />
        </div>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <WatchCard icon={<Network className="w-4 h-4" />} title="The situation board" body="Failing nodes flare red, the compromised node pulses, and a countdown ticks toward blackout." />
        <WatchCard icon={<Activity className="w-4 h-4" />} title="The agent team" body="Each specialist reasons with Claude and acts on the live world in parallel." />
        <WatchCard icon={<MessagesSquare className="w-4 h-4" />} title="The negotiation" body="When a choice endangers critical infrastructure, the guardian vetoes — and the team reroutes." />
        <WatchCard icon={<ShieldCheck className="w-4 h-4" />} title="The post-mortem" body="A traced read-out of every decision: context, choice, and the alternatives rejected." />
      </motion.div>

      <motion.div variants={item}>
        <IntegrationRail integrations={integrations} />
      </motion.div>
    </motion.div>
  );
}

function WatchCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="glass rounded-2xl p-4 hover:border-signal/40 transition-colors duration-300">
      <div className="w-8 h-8 rounded-lg bg-signal/12 text-signal-bright flex items-center justify-center">{icon}</div>
      <h3 className="font-display text-sm text-slate-100 mt-3">{title}</h3>
      <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active — a full-height cockpit. Columns share the viewport height and scroll
// internally so nothing leaves a ragged gap; the situation board grows to fill.
// ---------------------------------------------------------------------------
function Cockpit({
  state,
  consoleProps,
  agentsLite,
  voice,
  setVoice,
  voiceLabel,
  running,
}: {
  state: ReturnType<typeof useGhost>["state"];
  consoleProps: ConsoleProps;
  agentsLite: { id: string; name: string; color: string }[];
  voice: boolean;
  setVoice: (v: boolean) => void;
  voiceLabel: string;
  running: boolean;
}) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:h-[calc(100vh-92px)]"
    >
      {/* left rail */}
      <div className="lg:col-span-3 flex flex-col gap-4 lg:min-h-0">
        <motion.div variants={item}>
          <ScenarioConsole {...consoleProps} />
        </motion.div>
        <motion.div variants={item} className="lg:flex-1 lg:min-h-0 flex">
          <AgentPanels agents={state.agents} />
        </motion.div>
        <motion.div variants={item}>
          <IntegrationRail integrations={state.integrations} compact />
        </motion.div>
      </div>

      {/* center stage */}
      <div className="lg:col-span-6 flex flex-col gap-4 lg:min-h-0">
        <motion.div variants={item}>
          <CrisisHud metrics={state.metrics} secondsRemaining={state.secondsRemaining} timeLimit={state.timeLimit} running={running} outcome={state.outcome} />
        </motion.div>
        <motion.div variants={item} className="lg:flex-1 lg:min-h-0">
          <GraphBoard title={state.scenario?.title ?? "Crisis world"} threat={state.scenario?.threatType} summary={state.scenario?.summary} nodesCount={state.nodes.length} running={running}>
            <WorldGraph nodes={state.nodes} />
          </GraphBoard>
        </motion.div>
        <motion.div variants={item} className="shrink-0">
          <NegotiationBus messages={state.messages} agents={agentsLite} />
        </motion.div>
      </div>

      {/* right rail */}
      <div className="lg:col-span-3 flex flex-col gap-4 lg:min-h-0">
        <motion.div variants={item}>
          <WorkflowViz workflow={state.workflow} tick={state.workflowTick} running={running} orkes={state.orkes} />
        </motion.div>
        <motion.div variants={item} className="lg:flex-1 lg:min-h-0 flex">
          <NarrationFeed narrations={state.narrations} voice={voice} onToggleVoice={() => setVoice(!voice)} voiceLabel={voiceLabel} />
        </motion.div>
      </div>
    </motion.div>
  );
}

function GraphBoard({ title, threat, summary, nodesCount, running, children }: { title: string; threat?: string; summary?: string; nodesCount: number; running: boolean; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-4 grid-bg flex flex-col h-full overflow-hidden min-h-[340px]">
      <div className="flex items-start justify-between gap-3 mb-2 shrink-0">
        <div className="min-w-0">
          <h2 className="font-display text-base text-slate-100 leading-tight truncate" title={title}>{title}</h2>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate" title={summary}>{threat ? `Threat: ${threat}` : summary}</p>
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 justify-end max-w-[48%] shrink-0">
          {LEGEND.map((s) => (
            <span key={s} className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{ background: NODE_COLORS[s] }} />
              {NODE_LABEL[s]}
            </span>
          ))}
        </div>
      </div>
      <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-line/60 bg-ink/30">
        {running && (
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-24 gp-scan pointer-events-none z-10"
            style={{ background: "linear-gradient(90deg, transparent, rgba(110,139,255,0.10), transparent)" }}
          />
        )}
        {nodesCount === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
            <span className="w-11 h-11 rounded-xl bg-signal/12 flex items-center justify-center">
              <Network className="w-5 h-5 text-signal-bright pp-pulse" />
            </span>
            <p className="text-sm text-slate-400 max-w-[19rem] leading-relaxed">Designing the world from your prompt and live threat intelligence…</p>
          </div>
        ) : (
          <div className="absolute inset-0 p-1">{children}</div>
        )}
      </div>
      <p className="text-[10px] text-slate-600 mt-1.5 text-right font-data shrink-0">{nodesCount} nodes · agents act on this world via structured JSON</p>
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
