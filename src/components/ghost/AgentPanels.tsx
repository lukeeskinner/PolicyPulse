"use client";

import { Cpu, Radio } from "lucide-react";
import type { AgentRuntime } from "@/lib/ghost/useGhost";
import { PHASE_LABEL, phaseActive } from "@/lib/ghost/ui";
import { cn } from "@/lib/utils";

export function AgentPanels({ agents }: { agents: AgentRuntime[] }) {
  if (!agents.length) return null;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4 text-signal" />
        <h3 className="eyebrow">Agent team</h3>
        <span className="ml-auto text-[10px] text-slate-500 font-data">{agents.length} deployed · Fetch.ai</span>
      </div>
      <div className="space-y-2.5">
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentRuntime }) {
  const active = phaseActive(agent.phase);
  return (
    <div className="rounded-xl bg-ink/45 border border-line p-3" style={{ borderColor: active ? `${agent.color}66` : undefined }}>
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${agent.color}22`, color: agent.color }}
        >
          <Cpu className={cn("w-3.5 h-3.5", active && "pp-pulse")} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-100">{agent.name}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-data shrink-0"
              style={{ background: `${agent.color}1f`, color: agent.color }}
            >
              {PHASE_LABEL[agent.phase]}
            </span>
          </div>
          <div className="font-data text-[9px] text-slate-600 truncate">{agent.fetchAddress}</div>
        </div>
      </div>

      {agent.thought && (
        <p className="text-[11px] text-slate-400 mt-2 leading-snug italic line-clamp-2">“{agent.thought}”</p>
      )}

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
    </div>
  );
}
