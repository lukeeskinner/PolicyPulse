"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentAction,
  AgentPhase,
  GhostAgent,
  GhostEvent,
  GhostOutcome,
  GhostRequest,
  GhostRunMeta,
  Grounding,
  IntegrationStatus,
  Narration,
  NegMessage,
  PostMortem,
  Scenario,
  StepStatus,
  TraceSpan,
  WorldMetrics,
  WorldNode,
  WorkflowStepId,
} from "./types";

export type GhostPhase =
  | "idle"
  | "parsing"
  | "grounding"
  | "deploying"
  | "running"
  | "resolved"
  | "error";

export interface AgentRuntime extends GhostAgent {
  phase: AgentPhase;
  thought?: string;
  lastAction?: AgentAction;
  actionsCount: number;
}

export interface ConflictRecord {
  tick: number;
  description: string;
  vetoedAction: string;
  by: string;
}

const STEP_IDS: WorkflowStepId[] = [
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

function emptyWorkflow(): Record<WorkflowStepId, StepStatus> {
  return Object.fromEntries(STEP_IDS.map((s) => [s, "pending"])) as Record<WorkflowStepId, StepStatus>;
}

export interface GhostState {
  status: "idle" | "running" | "complete" | "error";
  phase: GhostPhase;
  runId?: string;
  meta?: GhostRunMeta;
  integrations?: IntegrationStatus;
  orkes?: { workflowId: string; url: string };
  scenario?: Scenario;
  grounding?: Grounding;
  nodes: WorldNode[];
  metrics?: WorldMetrics;
  agents: AgentRuntime[];
  agentIndex: Record<string, number>;
  tick: number;
  secondsRemaining: number;
  timeLimit: number;
  workflow: Record<WorkflowStepId, StepStatus>;
  workflowTick: number;
  messages: NegMessage[];
  narrations: Narration[];
  spans: TraceSpan[];
  conflicts: ConflictRecord[];
  consensus?: { tick: number; summary: string; latencyMs: number };
  patches: { target: string; summary: string }[];
  outcome?: GhostOutcome;
  postMortem?: PostMortem;
  error?: string;
}

const INITIAL: GhostState = {
  status: "idle",
  phase: "idle",
  nodes: [],
  agents: [],
  agentIndex: {},
  tick: 0,
  secondsRemaining: 0,
  timeLimit: 0,
  workflow: emptyWorkflow(),
  workflowTick: 0,
  messages: [],
  narrations: [],
  spans: [],
  conflicts: [],
  patches: [],
};

function clone(s: GhostState): GhostState {
  return {
    ...s,
    nodes: [...s.nodes],
    agents: [...s.agents],
    agentIndex: { ...s.agentIndex },
    workflow: { ...s.workflow },
    messages: [...s.messages],
    narrations: [...s.narrations],
    spans: [...s.spans],
    conflicts: [...s.conflicts],
    patches: [...s.patches],
  };
}

function applyEvent(d: GhostState, e: GhostEvent) {
  switch (e.type) {
    case "run_started":
      d.status = "running";
      d.phase = "parsing";
      d.meta = e.meta;
      d.integrations = e.integrations;
      break;
    case "grounding":
      d.grounding = e.grounding;
      d.phase = "grounding";
      break;
    case "scenario_parsed":
      d.scenario = e.scenario;
      d.timeLimit = e.scenario.timeLimitSec;
      d.secondsRemaining = e.scenario.timeLimitSec;
      d.phase = "deploying";
      break;
    case "orkes_workflow":
      d.orkes = { workflowId: e.workflowId, url: e.url };
      break;
    case "world_init":
      d.nodes = e.nodes;
      d.metrics = e.metrics;
      d.phase = "deploying";
      break;
    case "agents_deployed":
      d.agents = e.agents.map((a) => ({ ...a, phase: "idle", actionsCount: 0 }));
      d.agentIndex = Object.fromEntries(d.agents.map((a, i) => [a.id, i]));
      break;
    case "tick_started":
      d.tick = e.tick;
      d.secondsRemaining = e.secondsRemaining;
      d.workflow = emptyWorkflow();
      d.workflowTick = e.tick;
      d.phase = "running";
      break;
    case "workflow_step":
      d.workflow = { ...d.workflow, [e.step]: e.status };
      break;
    case "agent_phase": {
      const i = d.agentIndex[e.agentId];
      if (i != null) {
        d.agents[i] = { ...d.agents[i], phase: e.phase, thought: e.thought ?? d.agents[i].thought };
      }
      break;
    }
    case "agent_action": {
      const i = d.agentIndex[e.action.agentId];
      if (i != null) {
        d.agents[i] = { ...d.agents[i], lastAction: e.action, actionsCount: d.agents[i].actionsCount + 1 };
      }
      break;
    }
    case "neg_message":
      d.messages = [...d.messages, e.message];
      break;
    case "conflict":
      d.conflicts = [...d.conflicts, { tick: e.tick, description: e.description, vetoedAction: e.vetoedAction, by: e.by }];
      break;
    case "consensus":
      d.consensus = { tick: e.tick, summary: e.summary, latencyMs: e.latencyMs };
      break;
    case "trace_span":
      d.spans = [...d.spans, e.span];
      break;
    case "world_update":
      d.nodes = e.nodes;
      d.metrics = e.metrics;
      break;
    case "narration":
      d.narrations = [e.narration, ...d.narrations].slice(0, 60);
      break;
    case "patch":
      d.patches = [...d.patches, { target: e.target, summary: e.summary }];
      break;
    case "resolved":
      d.outcome = e.outcome;
      d.metrics = e.metrics;
      d.phase = "resolved";
      break;
    case "postmortem":
      d.postMortem = e.postMortem;
      break;
    case "run_complete":
      if (d.status === "running") d.status = "complete";
      break;
    case "error":
      d.status = "error";
      d.phase = "error";
      d.error = e.message;
      break;
  }
}

export function useGhost(initialVoice = true) {
  const [state, setState] = useState<GhostState>(INITIAL);
  const [voice, setVoiceState] = useState(initialVoice);
  const stateRef = useRef<GhostState>(INITIAL);
  const esRef = useRef<EventSource | null>(null);
  const bufferRef = useRef<GhostEvent[]>([]);
  const rafRef = useRef<number | null>(null);

  // --- voice (Deepgram Aura -> Web Speech fallback) -------------------------
  const voiceRef = useRef(initialVoice);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);

  const stopSpeaking = useCallback(() => {
    queueRef.current = [];
    speakingRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    voiceRef.current = voice;
    if (!voice) stopSpeaking();
  }, [voice, stopSpeaking]);

  const playAudio = (url: string) =>
    new Promise<void>((resolve) => {
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });

  const webSpeech = (text: string) =>
    new Promise<void>((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 0.92;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });

  const speakOne = useCallback(async (text: string) => {
    try {
      const res = await fetch("/api/ghost/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        await playAudio(url);
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      /* fall through to browser speech */
    }
    await webSpeech(text);
  }, []);

  const drain = useCallback(async () => {
    if (speakingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    speakingRef.current = true;
    try {
      await speakOne(next);
    } finally {
      speakingRef.current = false;
      if (queueRef.current.length) void drain();
    }
  }, [speakOne]);

  const enqueueSpeak = useCallback(
    (text: string) => {
      if (!voiceRef.current) return;
      queueRef.current.push(text);
      void drain();
    },
    [drain],
  );

  // --- event stream ---------------------------------------------------------
  const commit = useCallback((next: GhostState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const flush = useCallback(() => {
    rafRef.current = null;
    const events = bufferRef.current;
    if (!events.length) return;
    bufferRef.current = [];
    const d = clone(stateRef.current);
    for (const e of events) applyEvent(d, e);
    commit(d);
  }, [commit]);

  const schedule = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const reset = useCallback(() => {
    if (esRef.current) esRef.current.close();
    esRef.current = null;
    bufferRef.current = [];
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopSpeaking();
    commit(INITIAL);
  }, [commit, stopSpeaking]);

  const start = useCallback(
    async (req: GhostRequest) => {
      if (esRef.current) esRef.current.close();
      stopSpeaking();
      bufferRef.current = [];
      commit({ ...INITIAL, status: "running", phase: "parsing" });

      let runId: string;
      try {
        const res = await fetch("/api/ghost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const data = await res.json();
        if (!res.ok || !data.runId) throw new Error(data.error || "Failed to start scenario");
        runId = data.runId;
      } catch (err) {
        commit({ ...stateRef.current, status: "error", phase: "error", error: err instanceof Error ? err.message : "Failed to start" });
        return;
      }
      commit({ ...stateRef.current, runId });

      const es = new EventSource(`/api/ghost/stream/${runId}`);
      esRef.current = es;
      es.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as GhostEvent;
          bufferRef.current.push(event);
          schedule();
          if (event.type === "narration") enqueueSpeak(event.narration.text);
          if (event.type === "run_complete") {
            es.close();
            esRef.current = null;
            requestAnimationFrame(flush);
          }
        } catch {
          /* ignore malformed */
        }
      };
      es.onerror = () => {
        /* the run replays from the durable snapshot on reconnect */
      };
    },
    [commit, schedule, flush, enqueueSpeak, stopSpeaking],
  );

  const setVoice = useCallback((v: boolean) => setVoiceState(v), []);

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      stopSpeaking();
    };
  }, [stopSpeaking]);

  return { state, start, reset, voice, setVoice };
}
