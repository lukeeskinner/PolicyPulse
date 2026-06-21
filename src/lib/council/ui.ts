import type { CouncilOutcome, CouncilStepId, CouncilTone, DebateIntent, Stance, StakeholderPhase, StepStatus, Vote } from "./types";

// Client-safe UI constants & helpers for the Stakeholder Council chamber.

export const STANCE: Record<Stance, { label: string; color: string }> = {
  support: { label: "Supports", color: "#34d399" },
  conditional: { label: "Conditional", color: "#f59e0b" },
  oppose: { label: "Opposes", color: "#fb7185" },
};

export const INTENT: Record<DebateIntent, { label: string; color: string }> = {
  position: { label: "POSITION", color: "#9fb0ff" },
  support: { label: "SUPPORT", color: "#34d399" },
  oppose: { label: "OPPOSE", color: "#fb7185" },
  amend: { label: "AMEND", color: "#f59e0b" },
  concede: { label: "CONCEDE", color: "#22d3ee" },
  veto: { label: "VETO", color: "#fb7185" },
  gavel: { label: "CHAIR", color: "#e2e8f0" },
  consensus: { label: "CONSENSUS", color: "#34d399" },
};

export const PHASE_LABEL: Record<StakeholderPhase, string> = {
  idle: "Seated",
  reviewing: "Reading the brief",
  reasoning: "Weighing the evidence",
  speaking: "On the floor",
  deciding: "Casting a vote",
  done: "Voted",
};

export function phaseActive(phase: StakeholderPhase): boolean {
  return phase === "reviewing" || phase === "reasoning" || phase === "speaking" || phase === "deciding";
}

export const VOTE_META: Record<Vote, { label: string; color: string }> = {
  aye: { label: "Aye", color: "#34d399" },
  nay: { label: "Nay", color: "#fb7185" },
  abstain: { label: "Abstain", color: "#94a3b8" },
};

export const OUTCOME_META: Record<CouncilOutcome, { label: string; color: string }> = {
  passed: { label: "Passed", color: "#34d399" },
  passed_amended: { label: "Passed — amended", color: "#34d399" },
  deadlocked: { label: "Deadlocked", color: "#f59e0b" },
  failed: { label: "Failed", color: "#fb7185" },
};

export const TONE_COLOR: Record<CouncilTone, string> = {
  info: "#9fb0ff",
  alert: "#f59e0b",
  success: "#34d399",
  conflict: "#fb7185",
};

export function toneTextClass(tone: CouncilTone): string {
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

export const STEP_LABEL: Record<CouncilStepId, string> = {
  ground: "Simulate the bill",
  convene: "Seat the council",
  positions: "Opening positions",
  debate: "Debate the floor",
  amend: "Adopt amendments",
  retest: "Re-test on the twin",
  vote: "Call the vote",
  ratify: "Ratify verdict",
};

export function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}
