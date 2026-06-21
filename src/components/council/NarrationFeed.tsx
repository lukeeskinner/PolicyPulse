"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import type { CouncilNarration } from "@/lib/council/types";
import { TONE_COLOR, toneTextClass } from "@/lib/council/ui";
import { cn } from "@/lib/utils";

interface Props {
  narrations: CouncilNarration[];
  voice: boolean;
  onToggleVoice: () => void;
  voiceLabel: string;
}

export function NarrationFeed({ narrations, voice, onToggleVoice, voiceLabel }: Props) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col h-full min-h-0 flex-1">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <span className={cn("w-2 h-2 rounded-full", voice ? "bg-emerald-400 pp-pulse" : "bg-slate-600")} />
        <h3 className="eyebrow">Live narration</h3>
        <button
          onClick={onToggleVoice}
          title={voice ? `${voiceLabel} on` : "Muted"}
          className="ml-auto flex items-center gap-1 text-[10px] font-data px-2 py-1 rounded-full border border-line text-slate-400 hover:text-signal-bright hover:border-signal/50 transition-colors"
        >
          {voice ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
          {voice ? voiceLabel : "Muted"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
        {narrations.length === 0 ? (
          <p className="text-sm text-slate-600">The chair narrates the hearing aloud as it unfolds.</p>
        ) : (
          <AnimatePresence initial={false}>
            {narrations.map((n) => (
              <motion.div
                key={n.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-start gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: TONE_COLOR[n.tone] }} />
                <p className={cn("text-[12.5px] leading-snug", toneTextClass(n.tone))}>{n.text}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
