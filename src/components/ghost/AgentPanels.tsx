"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Cpu, Radio } from "lucide-react";
import type { AgentRuntime } from "@/lib/ghost/useGhost";
import { PHASE_LABEL, phaseActive } from "@/lib/ghost/ui";
import { cn } from "@/lib/utils";

export function AgentPanels({ agents }: { agents: AgentRuntime[] }) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col h-full min-h-0 flex-1 w-full">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Radio className={cn("w-4 h-4 text-signal", agents.length && "pp-pulse")} />
        <h3 className="eyebrow">Agent team</h3>
        <span className="ml-auto text-[10px] text-slate-500 font-data">{agents.length ? `${agents.length} deployed · Fetch.ai` : "awaiting deployment"}</span>
      </div>
      {agents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-[13px] text-slate-600 px-6 min-h-[120px]">
          Specialist agents deploy here once the world is designed.
        </div>
      ) : (
        <div className="space-y-2.5 overflow-y-auto pr-1 min-h-0">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentRuntime }) {
  const active = phaseActive(agent.phase);
  return (
    <motion.div
      layout
      animate={{
        borderColor: active ? `${agent.color}66` : "rgba(39,44,56,1)",
        boxShadow: active ? `0 0 22px ${agent.color}22` : "0 0 0 rgba(0,0,0,0)",
      }}
      transition={{ duration: 0.4 }}
      className="rounded-xl bg-ink/45 border p-3"
    >
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${agent.color}22`, color: agent.color }}>
          <Cpu className={cn("w-3.5 h-3.5", active && "pp-pulse")} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-100">{agent.name}</span>
            <AnimatePresence mode="wait">
              <motion.span
                key={agent.phase}
                initial={{ opacity: 0, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 3 }}
                transition={{ duration: 0.2 }}
                className="text-[10px] px-1.5 py-0.5 rounded-full font-data shrink-0"
                style={{ background: `${agent.color}1f`, color: agent.color }}
              >
                {PHASE_LABEL[agent.phase]}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="font-data text-[9px] text-slate-600 truncate">Fetch.ai uAgent · {agent.role}</div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {agent.thought && (
          <motion.p
            key={agent.thought}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-[11px] text-slate-400 mt-2 leading-snug italic line-clamp-2"
          >
            &ldquo;{agent.thought}&rdquo;
          </motion.p>
        )}
      </AnimatePresence>

      {agent.lastAction && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px]">
          <span className="font-data text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-400 uppercase shrink-0 mt-px">{agent.lastAction.kind}</span>
          <span className="text-slate-300 leading-snug">{agent.lastAction.summary}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600 font-data">
        <span className="truncate max-w-[70%]">{agent.blurb}</span>
        <span>{agent.actionsCount} act</span>
      </div>
    </motion.div>
  );
}
