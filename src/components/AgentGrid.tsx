"use client";

import { memo } from "react";
import type { AgentView } from "@/lib/useSimulation";
import { groupColor, OUTCOME_COLORS, roleShort } from "@/lib/ui";
import { cn, fmtPct, fmtUSD } from "@/lib/utils";

interface Props {
  agents: AgentView[];
  total: number;
  onSelect: (id: string) => void;
  selectedId?: string;
}

function ringForState(a: AgentView): string {
  if (a.outcome) return ""; // post-run handled by border color
  const f = a.lastFlags ?? [];
  if (a.state?.displaced || a.state?.leftJurisdiction) return "ring-2 ring-rose-500";
  if (f.includes("job_loss") || f.includes("hours_cut") || f.includes("business_closed"))
    return "ring-2 ring-amber-400";
  if (f.includes("wage_raise") || f.includes("rent_capped")) return "ring-2 ring-emerald-400";
  return "";
}

const Cell = memo(function Cell({
  a,
  onSelect,
  selected,
}: {
  a: AgentView;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const base = groupColor(a.group);
  const border = a.outcome ? OUTCOME_COLORS[a.outcome] : "transparent";
  const title = `${a.name} · ${roleShort(a.roles)} · ${a.group}\n${a.neighborhood} · ${a.tenure} · ${fmtUSD(a.income)}/yr${
    a.state ? `\nRent burden ${fmtPct(a.state.rentBurden)} · ${a.state.status}` : ""
  }`;
  return (
    <button
      onClick={() => onSelect(a.id)}
      title={title}
      className={cn(
        "pp-pop relative w-6 h-6 rounded-md transition-transform hover:scale-125 hover:z-10",
        ringForState(a),
        selected && "scale-125 z-10 ring-2 ring-white",
      )}
      style={{
        backgroundColor: base,
        boxShadow: a.outcome ? `inset 0 0 0 2px ${border}` : undefined,
        opacity: a.state?.leftJurisdiction ? 0.3 : 1,
      }}
    >
      {a.state?.leftJurisdiction && (
        <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white">✕</span>
      )}
    </button>
  );
});

export const AgentGrid = memo(function AgentGrid({ agents, total, onSelect, selectedId }: Props) {
  const placeholders = Math.max(0, total - agents.length);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 content-start">
        {agents.map((a) => (
          <Cell key={a.id} a={a} onSelect={onSelect} selected={a.id === selectedId} />
        ))}
        {Array.from({ length: placeholders }).map((_, i) => (
          <div key={`ph${i}`} className="w-6 h-6 rounded-md border border-dashed border-slate-700/50" />
        ))}
      </div>
    </div>
  );
});
