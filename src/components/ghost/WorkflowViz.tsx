"use client";

import { Check, ExternalLink, Workflow } from "lucide-react";
import type { StepStatus, WorkflowStepId } from "@/lib/ghost/types";
import { STEP_STATUS_COLOR, WORKFLOW_LABEL } from "@/lib/ghost/ui";
import { cn } from "@/lib/utils";

const ORDER: WorkflowStepId[] = [
  "snapshot",
  "fan_out",
  "collect",
  "detect_conflict",
  "negotiate",
  "resolve",
  "apply",
  "narrate",
  "advance",
];

interface Props {
  workflow: Record<WorkflowStepId, StepStatus>;
  tick: number;
  running: boolean;
  orkes?: { workflowId: string; url: string };
}

export function WorkflowViz({ workflow, tick, running, orkes }: Props) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Workflow className={cn("w-4 h-4 text-signal", running && "pp-pulse")} />
        <h3 className="eyebrow">Orchestration</h3>
        {orkes ? (
          <a
            href={orkes.url}
            target="_blank"
            rel="noreferrer"
            title={`Live Orkes execution ${orkes.workflowId}`}
            className="ml-auto flex items-center gap-1 text-[10px] font-data text-emerald-300 hover:text-emerald-200"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pp-pulse" /> Orkes live
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        ) : (
          <span className="ml-auto text-[10px] text-slate-500 font-data">Orkes · tick loop {tick > 0 ? `#${tick}` : ""}</span>
        )}
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
                {WORKFLOW_LABEL[id]}
              </span>
              {i < ORDER.length - 1 && <span className="w-px h-3" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
