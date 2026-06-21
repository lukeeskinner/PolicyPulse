"use client";

import { useEffect, useState } from "react";
import { Play, RotateCcw, Sparkles, Database, Brain, Globe } from "lucide-react";
import type { SimRequest } from "@/lib/types";
import { JURISDICTIONS, PRESETS } from "@/lib/ui";
import { cn } from "@/lib/utils";

interface HealthState {
  redis: { configured: boolean; connected: boolean };
  anthropic: boolean;
  browserbase: boolean;
}

interface Props {
  onRun: (req: SimRequest) => void;
  onReset: () => void;
  status: "idle" | "running" | "complete" | "error";
  initialPolicy?: string;
  initialJurisdiction?: string;
}

export function PolicyConsole({ onRun, onReset, status, initialPolicy, initialJurisdiction }: Props) {
  const [policy, setPolicy] = useState(initialPolicy ?? PRESETS[0].policy);
  const [jurisdiction, setJurisdiction] = useState(initialJurisdiction ?? PRESETS[0].jurisdiction);
  const [agentCount, setAgentCount] = useState(60);
  const [health, setHealth] = useState<HealthState | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
  }, []);

  const running = status === "running";

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-signal" />
        <h2 className="font-data text-[11px] font-semibold tracking-[0.2em] text-slate-200 uppercase">
          Policy Console
        </h2>
      </div>

      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        Paste a bill or describe a policy
      </label>
      <textarea
        value={policy}
        onChange={(e) => setPolicy(e.target.value)}
        disabled={running}
        rows={5}
        placeholder="e.g. Cap annual rent increases at 3% for existing tenants…"
        className="w-full resize-none rounded-xl bg-ink/60 border border-line px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal/50"
      />

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            disabled={running}
            onClick={() => {
              setPolicy(p.policy);
              setJurisdiction(p.jurisdiction);
              setAgentCount(p.agentCount);
            }}
            className="text-[11px] px-2.5 py-1 rounded-full border border-line text-slate-300 hover:border-signal/60 hover:text-signal-bright transition-colors disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">Jurisdiction</label>
          <input
            list="jurisdictions"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            disabled={running}
            className="w-full rounded-lg bg-ink/60 border border-line px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal/50"
          />
          <datalist id="jurisdictions">
            {JURISDICTIONS.map((j) => (
              <option key={j} value={j} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Residents: <span className="font-data text-signal-bright font-semibold">{agentCount}</span>
          </label>
          <input
            type="range"
            min={20}
            max={120}
            step={10}
            value={agentCount}
            onChange={(e) => setAgentCount(Number(e.target.value))}
            disabled={running}
            className="w-full accent-signal mt-2.5"
          />
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={() => onRun({ policy, jurisdiction, agentCount })}
          disabled={running || policy.trim().length < 8}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
            running
              ? "bg-surface-2 text-slate-400 cursor-not-allowed"
              : "bg-signal text-ink hover:bg-signal-bright hover:shadow-[0_0_24px_rgba(110,139,255,0.3)] disabled:opacity-50",
          )}
        >
          <Play className="w-4 h-4" />
          {running ? "Simulating…" : "Run simulation"}
        </button>
        <button
          onClick={onReset}
          disabled={running}
          className="rounded-xl px-3 py-2.5 border border-line text-slate-300 hover:text-slate-50 hover:border-slate-500 transition-colors disabled:opacity-40"
          title="Reset"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-line">
        <Integration icon={<Brain className="w-3.5 h-3.5" />} label="Mastra · Haiku" on={!!health?.anthropic} hint={health?.anthropic ? "Live LLM agents" : "Heuristic fallback"} />
        <Integration icon={<Database className="w-3.5 h-3.5" />} label="Redis" on={!!health?.redis?.connected} hint={health?.redis?.connected ? "Connected" : "In-memory"} />
        <Integration icon={<Globe className="w-3.5 h-3.5" />} label="Browserbase" on={!!health?.browserbase} hint={health?.browserbase ? "Live crawl" : "Grounded dataset"} />
      </div>
    </div>
  );
}

function Integration({ icon, label, on, hint }: { icon: React.ReactNode; label: string; on: boolean; hint: string }) {
  return (
    <div className="flex items-center gap-1.5" title={hint}>
      <span className={cn("flex items-center justify-center w-6 h-6 rounded-lg", on ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-500")}>
        {icon}
      </span>
      <div className="leading-tight">
        <div className="text-[11px] font-medium text-slate-300">{label}</div>
        <div className={cn("text-[10px]", on ? "text-emerald-400" : "text-slate-500")}>{hint}</div>
      </div>
    </div>
  );
}
