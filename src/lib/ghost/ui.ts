import type { AgentPhase, NarrationTone, NodeStatus, WorkflowStepId, StepStatus } from "./types";

// Client-safe UI constants & helpers for the Ghost Protocol dashboard.

export const NODE_COLORS: Record<NodeStatus, string> = {
  online: "#6e8bff",
  restored: "#34d399",
  degraded: "#f59e0b",
  offline: "#ef4444",
  compromised: "#fb7185",
  isolated: "#a78bfa",
};

export const NODE_LABEL: Record<NodeStatus, string> = {
  online: "Online",
  restored: "Restored",
  degraded: "Degraded",
  offline: "Offline",
  compromised: "Compromised",
  isolated: "Isolated",
};

export function nodeColor(status: NodeStatus): string {
  return NODE_COLORS[status] ?? "#64748b";
}

export function isFailing(status: NodeStatus): boolean {
  return status === "offline" || status === "compromised";
}

export const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: "Standing by",
  observing: "Observing world",
  reasoning: "Reasoning",
  proposing: "Proposing action",
  negotiating: "Negotiating",
  acting: "Acting",
  resolved: "Resolved",
};

export function phaseActive(phase: AgentPhase): boolean {
  return phase === "observing" || phase === "reasoning" || phase === "negotiating" || phase === "acting" || phase === "proposing";
}

export const TONE_COLOR: Record<NarrationTone, string> = {
  info: "#9fb0ff",
  alert: "#f59e0b",
  success: "#34d399",
  conflict: "#fb7185",
};

export function toneTextClass(tone: NarrationTone): string {
  switch (tone) {
    case "success":
      return "text-emerald-300";
    case "alert":
      return "text-amber-300";
    case "conflict":
      return "text-rose-400";
    default:
      return "text-signal-bright";
  }
}

export const STEP_STATUS_COLOR: Record<StepStatus, string> = {
  pending: "#3a4150",
  running: "#9fb0ff",
  done: "#34d399",
  skipped: "#5a6072",
};

export const WORKFLOW_LABEL: Record<WorkflowStepId, string> = {
  snapshot: "Snapshot world",
  fan_out: "Fan out to agents",
  collect: "Collect proposals",
  detect_conflict: "Detect conflicts",
  negotiate: "Negotiate",
  resolve: "Resolve",
  apply: "Apply to world",
  narrate: "Narrate",
  advance: "Advance tick",
};

export function fmtSeconds(s: number): string {
  const sec = Math.max(0, Math.round(s));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
