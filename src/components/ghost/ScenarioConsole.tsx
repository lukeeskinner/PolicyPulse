"use client";

import { useState } from "react";
import { Play, RotateCcw, Siren, Volume2, VolumeX } from "lucide-react";
import { DEFAULT_SCENARIO_ID, SCENARIO_PRESETS } from "@/lib/ghost/scenarios";
import { cn } from "@/lib/utils";

interface Props {
  onDeploy: (prompt: string, scenarioId?: string) => void;
  onReset: () => void;
  running: boolean;
  voice: boolean;
  onToggleVoice: () => void;
}

const DEFAULT_PROMPT = SCENARIO_PRESETS.find((p) => p.id === DEFAULT_SCENARIO_ID)?.prompt ?? SCENARIO_PRESETS[0].prompt;

export function ScenarioConsole({ onDeploy, onReset, running, voice, onToggleVoice }: Props) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [scenarioId, setScenarioId] = useState<string | undefined>(DEFAULT_SCENARIO_ID);

  const deploy = () => onDeploy(prompt.trim(), scenarioId);

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Siren className="w-4 h-4 text-signal" />
        <h2 className="font-data text-[11px] font-semibold tracking-[0.2em] text-slate-200 uppercase">Scenario Engine</h2>
        <button
          onClick={onToggleVoice}
          title={voice ? "Voice narration on" : "Voice muted"}
          className="ml-auto flex items-center gap-1 text-[10px] font-data px-2 py-1 rounded-full border border-line text-slate-400 hover:text-signal-bright hover:border-signal/50 transition-colors"
        >
          {voice ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          {voice ? "Voice" : "Muted"}
        </button>
      </div>

      <label className="block text-xs font-medium text-slate-400 mb-1.5">Describe a crisis in plain language</label>
      <textarea
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
          setScenarioId(undefined); // free-text → let the parser auto-detect the domain
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !running && prompt.trim().length >= 12) deploy();
        }}
        disabled={running}
        rows={5}
        placeholder="e.g. Bay Area power grid. Earthquake just hit. Nodes 3, 7, 11 offline. Node 9 under active ransomware. 200,000 residents lose power in 60 seconds…"
        className="w-full resize-none rounded-xl bg-ink/60 border border-line px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal/50"
      />

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {SCENARIO_PRESETS.map((p) => (
          <button
            key={p.id}
            disabled={running}
            onClick={() => {
              setPrompt(p.prompt);
              setScenarioId(p.id);
            }}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50",
              scenarioId === p.id ? "border-signal/60 text-signal-bright" : "border-line text-slate-300 hover:border-signal/60 hover:text-signal-bright",
            )}
          >
            {p.title}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={deploy}
          disabled={running || prompt.trim().length < 12}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
            running ? "bg-surface-2 text-slate-400 cursor-not-allowed" : "bg-signal text-ink hover:bg-signal-bright hover:shadow-[0_0_24px_rgba(110,139,255,0.3)] disabled:opacity-50",
          )}
        >
          <Play className="w-4 h-4" />
          {running ? "Simulation live…" : "Deploy agents"}
        </button>
        <button
          onClick={onReset}
          disabled={running}
          className="rounded-xl px-3 py-2.5 border border-line text-slate-300 hover:text-white hover:border-slate-500 transition-colors disabled:opacity-40"
          title="Reset"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[10px] text-slate-600 mt-2 font-data">⌘/Ctrl + Enter to deploy</p>
    </div>
  );
}
