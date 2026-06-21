"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import type { Narration } from "@/lib/ghost/types";
import { toneTextClass } from "@/lib/ghost/ui";

interface Props {
  narrations: Narration[];
  voice: boolean;
  onToggleVoice: () => void;
  voiceLabel: string; // "Deepgram Aura" | "Browser voice"
}

const TONE_DOT: Record<Narration["tone"], string> = {
  info: "bg-signal",
  alert: "bg-amber-400",
  success: "bg-emerald-400",
  conflict: "bg-rose-400",
};

export function NarrationFeed({ narrations, voice, onToggleVoice, voiceLabel }: Props) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col min-h-0 flex-1 h-full">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Volume2 className={`w-4 h-4 text-signal ${voice && narrations.length ? "pp-pulse" : ""}`} />
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
      <div className="flex-1 overflow-y-auto pr-1 min-h-[140px] mask-fade-y">
        {narrations.length === 0 && (
          <p className="text-sm text-slate-600">The voice of mission control narrates every significant agent decision here as the crisis unfolds.</p>
        )}
        <AnimatePresence initial={false}>
          {narrations.map((n) => (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="flex gap-2 text-[12px] leading-snug py-1"
            >
              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[n.tone]}`} />
              <span className="font-data text-slate-600 tabular-nums shrink-0">{n.tick > 0 ? `T${n.tick}` : "·"}</span>
              <span className={toneTextClass(n.tone)}>{n.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
