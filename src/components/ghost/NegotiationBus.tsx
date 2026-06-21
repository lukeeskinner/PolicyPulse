"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Ban, Check, CheckCheck, MessagesSquare, Radio, Repeat2 } from "lucide-react";
import type { NegIntent, NegMessage } from "@/lib/ghost/types";
import { cn } from "@/lib/utils";

interface AgentLite {
  id: string;
  name: string;
  color: string;
}

interface Props {
  messages: NegMessage[];
  agents: AgentLite[];
}

const INTENT: Record<NegIntent, { label: string; color: string; Icon: React.ComponentType<{ className?: string }> }> = {
  propose: { label: "PROPOSE", color: "#9fb0ff", Icon: ArrowRight },
  veto: { label: "VETO", color: "#fb7185", Icon: Ban },
  counter: { label: "COUNTER", color: "#f59e0b", Icon: Repeat2 },
  ack: { label: "ACK", color: "#34d399", Icon: Check },
  consensus: { label: "CONSENSUS", color: "#34d399", Icon: CheckCheck },
  broadcast: { label: "BROADCAST", color: "#94a3b8", Icon: Radio },
};

export function NegotiationBus({ messages, agents }: Props) {
  const byId = new Map(agents.map((a) => [a.id, a] as const));
  const nameOf = (id: string) => (id === "all" ? "all agents" : byId.get(id)?.name ?? id);

  return (
    <div className="glass rounded-2xl p-4 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <MessagesSquare className="w-4 h-4 text-signal" />
        <h3 className="eyebrow">Negotiation bus</h3>
        <span className="ml-auto text-[10px] text-slate-500 font-data">Fetch.ai · structured msgs</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[260px]">
        {messages.length === 0 && (
          <p className="text-sm text-slate-600">When agents disagree, their structured negotiation messages — proposals, vetoes, counters, and consensus — stream here.</p>
        )}
        <AnimatePresence initial={false}>
        {messages.map((m) => {
          const meta = INTENT[m.intent];
          const Icon = meta.Icon;
          const from = byId.get(m.from);
          return (
            <motion.div
              key={m.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={cn("rounded-lg border p-2.5", m.intent === "veto" ? "border-rose-500/50 bg-rose-500/[0.07] shadow-[0_0_18px_rgba(251,113,133,0.12)]" : "border-line bg-ink/40")}
            >
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="font-data px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1" style={{ background: `${meta.color}1f`, color: meta.color }}>
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </span>
                <span className="text-slate-400 truncate">
                  <span style={{ color: from?.color }}>{nameOf(m.from)}</span>
                  <ArrowRight className="inline w-3 h-3 mx-0.5 text-slate-600" />
                  {nameOf(m.to)}
                </span>
                <span className="ml-auto font-data text-[9px] text-slate-600 shrink-0">{m.protocol}</span>
              </div>
              <p className="font-data text-[10.5px] text-slate-300 mt-1.5 leading-snug break-words">{m.body}</p>
              {m.cite && (
                <p className="text-[10px] text-amber-300/90 mt-1 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-amber-300" /> cites {m.cite}
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
