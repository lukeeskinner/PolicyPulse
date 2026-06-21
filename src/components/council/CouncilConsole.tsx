"use client";

import { Gavel, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { JURISDICTIONS, PRESETS } from "@/lib/ui";
import { cn } from "@/lib/utils";

interface Props {
  policy: string;
  onPolicyChange: (p: string) => void;
  jurisdiction: string;
  onJurisdictionChange: (j: string) => void;
  onConvene: (policy: string, jurisdiction: string) => void;
  onReset: () => void;
  running: boolean;
  voice: boolean;
  onToggleVoice: () => void;
  className?: string;
}

export function CouncilConsole({
  policy,
  onPolicyChange,
  jurisdiction,
  onJurisdictionChange,
  onConvene,
  onReset,
  running,
  voice,
  onToggleVoice,
  className,
}: Props) {
  const disabled = running || policy.trim().length < 8 || jurisdiction.trim().length < 2;
  const convene = () => !disabled && onConvene(policy.trim(), jurisdiction.trim());

  return (
    <div className={cn("glass rounded-2xl p-5", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Gavel className={cn("w-4 h-4 text-signal", running && "pp-pulse")} />
        <h2 className="font-data text-[11px] font-semibold tracking-[0.2em] text-slate-200 uppercase">Bill on the floor</h2>
        <button
          onClick={onToggleVoice}
          title={voice ? "Voice narration on" : "Voice muted"}
          className="ml-auto flex items-center gap-1 text-[10px] font-data px-2 py-1 rounded-full border border-line text-slate-400 hover:text-signal-bright hover:border-signal/50 transition-colors"
        >
          {voice ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          {voice ? "Voice" : "Muted"}
        </button>
      </div>

      <label className="block text-xs font-medium text-slate-400 mb-1.5">Paste a bill or describe a policy</label>
      <textarea
        value={policy}
        onChange={(e) => onPolicyChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) convene();
        }}
        disabled={running}
        rows={4}
        placeholder="e.g. Cap annual rent increases for existing tenants at 3% per year, with just-cause eviction protections…"
        className="w-full resize-none rounded-xl bg-ink/60 border border-line px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal/50 transition-shadow"
      />

      <label className="block text-xs font-medium text-slate-400 mb-1.5 mt-3">Jurisdiction</label>
      <input
        list="council-jurisdictions"
        value={jurisdiction}
        onChange={(e) => onJurisdictionChange(e.target.value)}
        disabled={running}
        className="w-full rounded-lg bg-ink/60 border border-line px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-signal/40 focus:border-signal/50"
      />
      <datalist id="council-jurisdictions">
        {JURISDICTIONS.map((j) => (
          <option key={j} value={j} />
        ))}
      </datalist>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            disabled={running}
            onClick={() => {
              onPolicyChange(p.policy);
              onJurisdictionChange(p.jurisdiction);
            }}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50",
              policy === p.policy ? "border-signal/60 text-signal-bright bg-signal/5" : "border-line text-slate-300 hover:border-signal/60 hover:text-signal-bright",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mt-5">
        <button
          onClick={convene}
          disabled={disabled}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.98]",
            running ? "bg-surface-2 text-slate-400 cursor-not-allowed" : "bg-signal text-ink hover:bg-signal-bright hover:shadow-[0_0_28px_rgba(110,139,255,0.35)] disabled:opacity-50",
          )}
        >
          <Play className={cn("w-4 h-4", running && "pp-pulse")} />
          {running ? "Council in session…" : "Convene the council"}
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
      <p className="text-[10px] text-slate-600 mt-2 font-data">⌘/Ctrl + Enter · the bill is simulated, then debated</p>
    </div>
  );
}
