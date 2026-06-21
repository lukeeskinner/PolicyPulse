"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { AlertTriangle, Shield, Timer, Users, Zap } from "lucide-react";
import type { GhostOutcome, WorldMetrics } from "@/lib/ghost/types";
import { fmtSeconds } from "@/lib/ghost/ui";
import { cn } from "@/lib/utils";

interface Props {
  metrics?: WorldMetrics;
  secondsRemaining: number;
  timeLimit: number;
  running: boolean;
  outcome?: GhostOutcome;
}

// Eased count-up between metric updates. Honors reduced-motion.
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = to;
    if (reduce || from === to) {
      setDisplay(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 600;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <>{format(display)}</>;
}

export function CrisisHud({ metrics, secondsRemaining, timeLimit, running, outcome }: Props) {
  const [display, setDisplay] = useState(secondsRemaining);
  const [prevSecs, setPrevSecs] = useState(secondsRemaining);

  // Snap to the authoritative server value whenever a new tick arrives
  // (adjust-state-during-render, the supported alternative to a sync effect).
  if (secondsRemaining !== prevSecs) {
    setPrevSecs(secondsRemaining);
    setDisplay(secondsRemaining);
  }

  // Free-run the countdown between ticks (only ever decreases).
  useEffect(() => {
    if (!running || outcome) return;
    const t = setInterval(() => setDisplay((d) => Math.max(0, d - 1)), 1000);
    return () => clearInterval(t);
  }, [running, outcome]);

  const frac = timeLimit > 0 ? display / timeLimit : 1;
  const timerColor = outcome === "stabilized" ? "#34d399" : frac > 0.4 ? "#9fb0ff" : frac > 0.18 ? "#f59e0b" : "#ef4444";
  const atRisk = metrics?.populationAtRisk ?? 0;
  const online = metrics?.populationOnline ?? 0;
  const stability = metrics?.gridStability ?? 0;
  const containment = metrics?.threatContainment ?? 0;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-stretch gap-4">
        {/* Countdown */}
        <div className="flex flex-col items-center justify-center px-4 py-2 rounded-xl bg-ink/50 border min-w-[132px] transition-colors duration-700" style={{ borderColor: `${timerColor}40` }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Timer className="w-3.5 h-3.5" style={{ color: timerColor }} />
            <span className="eyebrow">{outcome ? "Outcome" : "Blackout in"}</span>
          </div>
          {outcome ? (
            <div className="text-center">
              <div className={cn("font-display text-2xl font-bold leading-none", outcome === "stabilized" ? "text-emerald-300" : outcome === "partial" ? "text-amber-300" : "text-rose-400")}>
                {outcome === "stabilized" ? "STABLE" : outcome === "partial" ? "PARTIAL" : "FAILED"}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 font-data">{fmtSeconds(display)} on clock</div>
            </div>
          ) : (
            <div className={cn("font-display text-4xl font-bold tabular-nums leading-none", frac <= 0.18 && running && "pp-pulse")} style={{ color: timerColor }}>
              {fmtSeconds(display)}
            </div>
          )}
        </div>

        {/* Metrics */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric icon={<Users className="w-3.5 h-3.5" />} label="With service" value={online} format={(n) => n.toLocaleString()} tone="good" />
          <Metric icon={<AlertTriangle className="w-3.5 h-3.5" />} label="At risk" value={atRisk} format={(n) => n.toLocaleString()} tone={atRisk > 0 ? "bad" : "good"} />
          <Metric icon={<Zap className="w-3.5 h-3.5" />} label="Grid stability" value={stability} format={(n) => `${n}%`} tone={stability >= 90 ? "good" : stability >= 60 ? "warn" : "bad"} bar={stability} />
          <Metric icon={<Shield className="w-3.5 h-3.5" />} label="Threat contained" value={containment} format={(n) => `${n}%`} tone={containment >= 90 ? "good" : containment >= 50 ? "warn" : "bad"} bar={containment} />
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  format,
  tone,
  bar,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  format: (n: number) => string;
  tone: "good" | "bad" | "warn";
  bar?: number;
}) {
  const color = tone === "good" ? "#34d399" : tone === "warn" ? "#f59e0b" : "#ef4444";
  return (
    <div className="rounded-xl bg-ink/40 border border-line px-3 py-2">
      <div className="flex items-center gap-1.5" style={{ color }}>
        {icon}
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="font-data text-lg text-slate-100 tabular-nums leading-tight mt-0.5">
        <AnimatedNumber value={value} format={format} />
      </div>
      {bar != null && (
        <div className="h-1 rounded-full bg-slate-800 overflow-hidden mt-1">
          <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.min(100, bar)}%`, background: color }} />
        </div>
      )}
    </div>
  );
}
