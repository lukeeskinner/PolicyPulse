"use client";

import { Volume2, VolumeX } from "lucide-react";
import type { Narration } from "@/lib/ghost/types";
import { toneTextClass } from "@/lib/ghost/ui";

interface Props {
  narrations: Narration[];
  voice: boolean;
  onToggleVoice: () => void;
  voiceLabel: string; // "Deepgram Aura" | "Browser voice"
}

export function NarrationFeed({ narrations, voice, onToggleVoice, voiceLabel }: Props) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex items-center justify-center w-4 h-4">
          <Volume2 className={`w-4 h-4 text-signal ${voice && narrations.length ? "pp-pulse" : ""}`} />
        </span>
        <h3 className="eyebrow">Mission control</h3>
        <button
          onClick={onToggleVoice}
          title={voice ? `Voice on · ${voiceLabel}` : "Voice muted"}
          className="ml-auto flex items-center gap-1 text-[10px] font-data px-2 py-1 rounded-full border border-line text-slate-400 hover:text-signal-bright hover:border-signal/50 transition-colors"
        >
          {voice ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          {voice ? voiceLabel : "Muted"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px]">
        {narrations.length === 0 && (
          <p className="text-sm text-slate-600">The voice of mission control narrates every significant agent decision here as the crisis unfolds…</p>
        )}
        {narrations.map((n) => (
          <div key={n.id} className="flex gap-2 text-[12px] leading-snug animate-[pp-pop_0.25s_ease]">
            <span className="font-data text-slate-600 tabular-nums shrink-0">{n.tick > 0 ? `T${n.tick}` : "·"}</span>
            <span className={toneTextClass(n.tone)}>{n.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
