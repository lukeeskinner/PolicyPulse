"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, ArrowRight, Ban, FileEdit, FlaskConical, Gavel, Ghost, Handshake, Map as MapIcon, MessagesSquare, Radio, Scale } from "lucide-react";
import { PulseLine, PulseMark } from "@/components/Brand";
import { AmendmentImpact } from "@/components/council/AmendmentImpact";
import { CouncilBench } from "@/components/council/CouncilBench";
import { CouncilConsole } from "@/components/council/CouncilConsole";
import { DebateStream } from "@/components/council/DebateStream";
import { DeliberationFlow } from "@/components/council/DeliberationFlow";
import { GroundingBrief } from "@/components/council/GroundingBrief";
import { IntegrationRail } from "@/components/council/IntegrationRail";
import { NarrationFeed } from "@/components/council/NarrationFeed";
import { Verdict } from "@/components/council/Verdict";
import { useCouncil, type CouncilPhase } from "@/lib/council/useCouncil";
import { PRESETS } from "@/lib/ui";
import { cn } from "@/lib/utils";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.03 } } };
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

export default function CouncilPage() {
  const { state, start, reset, voice, setVoice } = useCouncil(true);
  const [policy, setPolicy] = useState(PRESETS[0].policy);
  const [jurisdiction, setJurisdiction] = useState(PRESETS[0].jurisdiction);

  const active = state.status !== "idle";
  const running = state.status === "running";
  const voiceLabel = state.integrations?.deepgram ? "Deepgram Aura" : "Browser voice";
  const seatsLite = state.stakeholders.map((s) => ({ id: s.id, name: s.name, color: s.color }));
  const showVerdict = !!state.verdict;

  const consoleProps = {
    policy,
    onPolicyChange: setPolicy,
    jurisdiction,
    onJurisdictionChange: setJurisdiction,
    onConvene: (p: string, j: string) => start({ policy: p, jurisdiction: j, voice }),
    onReset: () => {
      reset();
      setPolicy(PRESETS[0].policy);
      setJurisdiction(PRESETS[0].jurisdiction);
    },
    running,
    voice,
    onToggleVoice: () => setVoice(!voice),
  };

  return (
    <div className="min-h-screen relative">
      <Atmosphere phase={state.phase} outcome={state.verdict?.outcome} />

      <header className="relative z-20 border-b border-line backdrop-blur sticky top-0 bg-ink/80">
        <div className="max-w-[1560px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <PulseMark className="w-9 h-9" live={running} />
            <div>
              <h1 className="font-display text-base font-semibold tracking-tight text-slate-50 leading-none group-hover:text-white flex items-center gap-1.5">
                <Gavel className="w-4 h-4 text-signal-bright" /> Stakeholder<span className="text-signal-bright">Council</span>
              </h1>
              <p className="eyebrow mt-1.5">A bill, debated by the people it touches — live</p>
            </div>
          </Link>
          <div className="flex items-center gap-2.5">
            <PhasePill phase={state.phase} />
            <Link href="/simulate" className="hidden md:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
              <FlaskConical className="w-3.5 h-3.5" /> Simulator
            </Link>
            <Link href="/ghost" className="hidden md:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
              <Ghost className="w-3.5 h-3.5" /> Ghost
            </Link>
            <Link href="/" className="hidden md:flex items-center gap-1.5 text-xs text-slate-300 hover:text-signal-bright border border-line hover:border-signal/50 rounded-full px-3 py-1.5 transition-colors">
              <MapIcon className="w-3.5 h-3.5" /> Pulse Map
            </Link>
          </div>
        </div>
        <PulseLine width={2200} height={20} className="absolute inset-x-0 -bottom-px h-5 opacity-70" />
      </header>

      <main className="relative z-10 max-w-[1560px] mx-auto px-4 lg:px-6 py-4">
        {!active ? (
          <Idle consoleProps={consoleProps} integrations={state.integrations} />
        ) : (
          <Cockpit state={state} consoleProps={consoleProps} seatsLite={seatsLite} voice={voice} setVoice={setVoice} voiceLabel={voiceLabel} running={running} />
        )}

        <AnimatePresence>
          {showVerdict && state.verdict && (
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mt-4">
              <Verdict verdict={state.verdict} stakeholders={state.stakeholders} />
            </motion.div>
          )}
        </AnimatePresence>

        {state.status === "error" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 glass rounded-2xl p-4 border border-rose-500/30 text-rose-300 text-sm">
            {state.error ?? "The council failed to convene."}
          </motion.div>
        )}
      </main>
    </div>
  );
}

function Atmosphere({ phase, outcome }: { phase: CouncilPhase; outcome?: string }) {
  const reduce = useReducedMotion();
  const live = phase === "debating" || phase === "retesting" || phase === "voting";
  const passed = outcome === "passed" || outcome === "passed_amended";
  const stuck = outcome === "deadlocked" || outcome === "failed";
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(70rem 44rem at 50% -12%, rgba(110,139,255,0.12), transparent 60%)" }}
        animate={{ opacity: live ? 1 : 0.4 }}
        transition={{ duration: reduce ? 0 : 1.4, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(70rem 44rem at 50% -12%, rgba(52,211,153,0.12), transparent 60%)" }}
        animate={{ opacity: passed ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 1.4 }}
      />
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(70rem 44rem at 50% -12%, rgba(245,158,11,0.12), transparent 60%)" }}
        animate={{ opacity: stuck ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 1.4 }}
      />
    </div>
  );
}

function PhasePill({ phase }: { phase: CouncilPhase }) {
  const label: Record<CouncilPhase, string> = {
    idle: "",
    grounding: "Simulating the bill",
    convening: "Seating the council",
    debating: "Debate live",
    retesting: "Re-testing the amendment",
    voting: "Calling the vote",
    ratified: "Ratified",
    error: "Error",
  };
  const done = phase === "ratified";
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

type ConsoleProps = Omit<React.ComponentProps<typeof CouncilConsole>, "className">;

function Idle({ consoleProps, integrations }: { consoleProps: ConsoleProps; integrations?: Parameters<typeof IntegrationRail>[0]["integrations"] }) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4 lg:min-h-[calc(100vh-108px)] lg:flex lg:flex-col lg:justify-center">
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-7 glass grid-bg rounded-2xl p-8 flex flex-col justify-center relative overflow-hidden min-h-[460px]">
          <PulseLine width={1400} height={16} className="absolute inset-x-0 top-6 h-4 opacity-30" />
          <span className="eyebrow mb-3">Who decides — and who pays</span>
          <h2 className="font-display text-3xl lg:text-[2.6rem] font-semibold text-slate-100 leading-[1.05] max-w-xl">
            Drop a bill in front of the people it touches.{" "}
            <span className="font-serif-editorial italic text-signal-bright">Watch them argue it out</span> — on the evidence.
          </h2>
          <p className="text-sm text-slate-400 mt-4 max-w-lg leading-relaxed">
            The bill is simulated on a digital twin of the community. Then the people it touches argue the measured result — and any amendment they adopt is <span className="text-slate-200">re-run on the same population</span>.
          </p>
          <FlowStrip />
        </div>
        <div className="lg:col-span-5 flex">
          <CouncilConsole {...consoleProps} className="w-full flex flex-col" />
        </div>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <WatchCard icon={<Scale className="w-4 h-4" />} title="The evidence" body="Each stance cites a real number for that seat's people." />
        <WatchCard icon={<Handshake className="w-4 h-4" />} title="The negotiation" body="Seats table amendments, concede, and form coalitions." />
        <WatchCard icon={<FlaskConical className="w-4 h-4" />} title="The re-test" body="The adopted amendment is re-run on the identical population." />
        <WatchCard icon={<Ban className="w-4 h-4" />} title="The verdict" body="A vote, a tally, and the concession that mattered." />
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

function Cockpit({
  state,
  consoleProps,
  seatsLite,
  voice,
  setVoice,
  voiceLabel,
  running,
}: {
  state: ReturnType<typeof useCouncil>["state"];
  consoleProps: ConsoleProps;
  seatsLite: { id: string; name: string; color: string }[];
  voice: boolean;
  setVoice: (v: boolean) => void;
  voiceLabel: string;
  running: boolean;
}) {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* left rail */}
      <div className="lg:col-span-3 flex flex-col gap-4">
        <motion.div variants={item}>
          <CouncilConsole {...consoleProps} />
        </motion.div>
        <motion.div variants={item} className="flex">
          <CouncilBench stakeholders={state.stakeholders} outcomes={state.brief?.outcomes} />
        </motion.div>
        <motion.div variants={item}>
          <IntegrationRail integrations={state.integrations} compact />
        </motion.div>
      </div>

      {/* center stage */}
      <div className="lg:col-span-6 flex flex-col gap-4">
        <motion.div variants={item}>
          <GroundingBrief brief={state.brief} />
        </motion.div>
        <AnimatePresence>
          {state.impact && (
            <motion.div key="impact" variants={item} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
              <AmendmentImpact impact={state.impact} stakeholders={seatsLite} />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div variants={item}>
          <DebateStream messages={state.messages} stakeholders={seatsLite} />
        </motion.div>
      </div>

      {/* right rail */}
      <div className="lg:col-span-3 flex flex-col gap-4">
        <motion.div variants={item}>
          <DeliberationFlow workflow={state.workflow} running={running} />
        </motion.div>
        <motion.div variants={item} className="flex">
          <NarrationFeed narrations={state.narrations} voice={voice} onToggleVoice={() => setVoice(!voice)} voiceLabel={voiceLabel} />
        </motion.div>
      </div>
    </motion.div>
  );
}

const FLOW: { icon: React.ReactNode; label: string }[] = [
  { icon: <Activity className="w-3.5 h-3.5" />, label: "Simulate" },
  { icon: <MessagesSquare className="w-3.5 h-3.5" />, label: "Debate" },
  { icon: <FileEdit className="w-3.5 h-3.5" />, label: "Amend" },
  { icon: <FlaskConical className="w-3.5 h-3.5" />, label: "Re-test" },
  { icon: <Gavel className="w-3.5 h-3.5" />, label: "Vote" },
];

// The deliberation is a real sequence, so an explicit left-to-right flow encodes
// it better than prose — five steps from raw bill to ratified verdict.
function FlowStrip() {
  return (
    <div className="mt-6 flex items-center gap-1.5 flex-wrap">
      {FLOW.map((f, i) => (
        <Fragment key={f.label}>
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-ink/40 px-2.5 py-1.5">
            <span className="text-signal-bright">{f.icon}</span>
            <span className="text-[12px] text-slate-200 font-medium">{f.label}</span>
          </div>
          {i < FLOW.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
        </Fragment>
      ))}
    </div>
  );
}
