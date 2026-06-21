"use client";

import { Check, Workflow } from "lucide-react";
import { COUNCIL_WORKFLOW } from "@/lib/council/types";
import type { CouncilStepId, StepStatus } from "@/lib/council/types";
import { STEP_LABEL, STEP_STATUS_COLOR } from "@/lib/council/ui";
import { cn } from "@/lib/utils";

const ORDER: CouncilStepId[] = COUNCIL_WORKFLOW.map((s) => s.id);

export function DeliberationFlow({ workflow, running }: { workflow: Record<CouncilStepId, StepStatus>; running: boolean }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Workflow className={cn("w-4 h-4 text-signal", running && "pp-pulse")} />
        <h3 className="eyebrow">Orchestration</h3>
        <span className="ml-auto text-[10px] text-slate-500 font-data">Orkes · deliberation flow</span>
      </div>
      <ol className="space-y-1">
        {ORDER.map((id, i) => {
          const status = workflow[id] ?? "pending";
          const color = STEP_STATUS_COLOR[status];
          return (
            <li key={id} className="flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-md shrink-0" style={{ background: `${color}22`, color }}>
                {status === "done" ? (
                  <Check className="w-3 h-3" />
                ) : status === "running" ? (
                  <span className="w-2 h-2 rounded-full pp-pulse" style={{ background: color }} />
                ) : (
                  <span className="font-data text-[9px]">{i + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  "text-[12px] flex-1",
                  status === "running" ? "text-slate-100" : status === "done" ? "text-slate-400" : status === "skipped" ? "text-slate-600 line-through" : "text-slate-600",
                )}
              >
                {STEP_LABEL[id]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
