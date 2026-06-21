"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Ban, CheckCheck, FileEdit, Gavel, Handshake, MessagesSquare, ThumbsUp } from "lucide-react";
import type { DebateIntent, DebateMessage } from "@/lib/council/types";
import { INTENT } from "@/lib/council/ui";
import { cn } from "@/lib/utils";

interface SeatLite {
  id: string;
  name: string;
  color: string;
}

const ICON: Record<DebateIntent, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  position: ArrowRight,
  support: ThumbsUp,
  oppose: Ban,
  amend: FileEdit,
  concede: Handshake,
  veto: Ban,
  gavel: Gavel,
  consensus: CheckCheck,
};

export function DebateStream({ messages, stakeholders }: { messages: DebateMessage[]; stakeholders: SeatLite[] }) {
  const byId = new Map(stakeholders.map((s) => [s.id, s] as const));
  const nameOf = (id: string) => (id === "floor" ? "the floor" : byId.get(id)?.name ?? id);

  return (
    <div className="glass rounded-2xl p-4 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <MessagesSquare className="w-4 h-4 text-signal" />
        <h3 className="eyebrow">The floor</h3>
        <span className="ml-auto text-[10px] text-slate-500 font-data">{messages.length ? `${messages.length} · Fetch.ai` : "Fetch.ai"}</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[320px]">
        {messages.length === 0 && <p className="text-sm text-slate-600">Each seat speaks from its constituents&rsquo; outcome — proposals, concessions, and vetoes stream here.</p>}
        <AnimatePresence initial={false}>
          {messages.map((m) => {
            const meta = INTENT[m.intent];
            const Icon = ICON[m.intent];
            const from = byId.get(m.from);
            const conflict = m.intent === "oppose" || m.intent === "veto";
            return (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className={cn("relative rounded-lg pl-3 pr-2.5 py-2 overflow-hidden border", conflict ? "border-rose-500/30 bg-rose-500/[0.05]" : "border-line bg-ink/40")}
              >
                <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: meta.color }} />
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Icon className="w-3 h-3 shrink-0" style={{ color: meta.color }} />
                  <span className="font-semibold truncate" style={{ color: from?.color ?? "#cbd5e1" }}>{nameOf(m.from)}</span>
                  {m.to !== "floor" && (
                    <>
                      <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                      <span className="text-slate-400 truncate">{nameOf(m.to)}</span>
                    </>
                  )}
                  <span className="ml-auto font-data text-[9px] shrink-0" style={{ color: meta.color }}>{meta.label}</span>
                </div>
                <p className="text-[12px] text-slate-200 mt-1 leading-snug line-clamp-2">{m.body}</p>
                {m.cite && (
                  <p className="text-[10px] text-amber-300/80 mt-1 truncate" title={m.cite}>
                    ↳ {m.cite}
                  </p>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
