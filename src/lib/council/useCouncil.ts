"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COUNCIL_WORKFLOW } from "./types";
import type {
  Amendment,
  AmendmentImpact,
  CastVote,
  CouncilEvent,
  CouncilIntegrationStatus,
  CouncilNarration,
  CouncilRequest,
  CouncilRunMeta,
  CouncilStepId,
  CouncilTraceSpan,
  DebateMessage,
  GroundingBrief,
  Position,
  Stakeholder,
  StakeholderPhase,
  StepStatus,
  Verdict,
} from "./types";

export type CouncilPhase = "idle" | "grounding" | "convening" | "debating" | "retesting" | "voting" | "ratified" | "error";

export interface StakeholderRuntime extends Stakeholder {
  phase: StakeholderPhase;
  thought?: string;
  position?: Position;
  vote?: CastVote;
}

const STEP_IDS: CouncilStepId[] = COUNCIL_WORKFLOW.map((s) => s.id);

function emptyWorkflow(): Record<CouncilStepId, StepStatus> {
  return Object.fromEntries(STEP_IDS.map((s) => [s, "pending"])) as Record<CouncilStepId, StepStatus>;
}

const STEP_PHASE: Record<CouncilStepId, CouncilPhase> = {
  ground: "grounding",
  convene: "convening",
  positions: "debating",
  debate: "debating",
  amend: "debating",
  retest: "retesting",
  vote: "voting",
  ratify: "ratified",
};

export interface CouncilState {
  status: "idle" | "running" | "complete" | "error";
  phase: CouncilPhase;
  runId?: string;
  meta?: CouncilRunMeta;
  integrations?: CouncilIntegrationStatus;
  brief?: GroundingBrief;
  stakeholders: StakeholderRuntime[];
  stakeholderIndex: Record<string, number>;
  positions: Position[];
  messages: DebateMessage[];
  amendments: Amendment[];
  spans: CouncilTraceSpan[];
  narrations: CouncilNarration[];
  impact?: AmendmentImpact;
  votes: CastVote[];
  verdict?: Verdict;
  workflow: Record<CouncilStepId, StepStatus>;
  error?: string;
}

const INITIAL: CouncilState = {
  status: "idle",
  phase: "idle",
  stakeholders: [],
  stakeholderIndex: {},
  positions: [],
  messages: [],
  amendments: [],
  spans: [],
  narrations: [],
  votes: [],
  workflow: emptyWorkflow(),
};

function clone(s: CouncilState): CouncilState {
  return {
    ...s,
    stakeholders: [...s.stakeholders],
    stakeholderIndex: { ...s.stakeholderIndex },
    positions: [...s.positions],
    messages: [...s.messages],
    amendments: [...s.amendments],
    spans: [...s.spans],
    narrations: [...s.narrations],
    votes: [...s.votes],
    workflow: { ...s.workflow },
  };
}

function applyEvent(d: CouncilState, e: CouncilEvent) {
  switch (e.type) {
    case "run_started":
      d.status = "running";
      d.phase = "grounding";
      d.meta = e.meta;
      d.integrations = e.integrations;
      break;
    case "step":
      d.workflow = { ...d.workflow, [e.step]: e.status };
      if (e.status === "running") d.phase = STEP_PHASE[e.step];
      break;
    case "grounding_ready":
      d.brief = e.brief;
      break;
    case "council_convened":
      d.stakeholders = e.stakeholders.map((s) => ({ ...s, phase: "idle" as StakeholderPhase }));
      d.stakeholderIndex = Object.fromEntries(d.stakeholders.map((s, i) => [s.id, i]));
      break;
    case "stakeholder_phase": {
      const i = d.stakeholderIndex[e.stakeholderId];
      if (i != null) d.stakeholders[i] = { ...d.stakeholders[i], phase: e.phase, thought: e.thought ?? d.stakeholders[i].thought };
      break;
    }
    case "position": {
      d.positions = [...d.positions, e.position];
      const i = d.stakeholderIndex[e.position.stakeholderId];
      if (i != null) d.stakeholders[i] = { ...d.stakeholders[i], position: e.position };
      break;
    }
    case "debate_msg":
      d.messages = [...d.messages, e.message];
      break;
    case "amendment_proposed":
      if (!d.amendments.some((a) => a.id === e.amendment.id)) d.amendments = [...d.amendments, e.amendment];
      break;
    case "amendment_adopted": {
      const idx = d.amendments.findIndex((a) => a.id === e.amendment.id);
      if (idx >= 0) {
        const next = [...d.amendments];
        next[idx] = e.amendment;
        d.amendments = next;
      } else d.amendments = [...d.amendments, e.amendment];
      break;
    }
    case "trace_span":
      d.spans = [...d.spans, e.span];
      break;
    case "amendment_impact":
      d.impact = e.impact;
      break;
    case "vote": {
      d.votes = [...d.votes, e.vote];
      const i = d.stakeholderIndex[e.vote.stakeholderId];
      if (i != null) d.stakeholders[i] = { ...d.stakeholders[i], vote: e.vote };
      break;
    }
    case "verdict":
      d.verdict = e.verdict;
      break;
    case "narration":
      d.narrations = [e.narration, ...d.narrations].slice(0, 60);
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

export function useCouncil(initialVoice = true) {
  const [state, setState] = useState<CouncilState>(INITIAL);
  const [voice, setVoiceState] = useState(initialVoice);
  const stateRef = useRef<CouncilState>(INITIAL);
  const esRef = useRef<EventSource | null>(null);
  const bufferRef = useRef<CouncilEvent[]>([]);
  const rafRef = useRef<number | null>(null);

  // --- voice (Deepgram Aura via /api/ghost/narrate -> Web Speech fallback) ---
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
      u.rate = 1.04;
      u.pitch = 0.95;
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
  const commit = useCallback((next: CouncilState) => {
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
    async (req: CouncilRequest) => {
      if (esRef.current) esRef.current.close();
      stopSpeaking();
      bufferRef.current = [];
      commit({ ...INITIAL, status: "running", phase: "grounding" });

      let runId: string;
      try {
        const res = await fetch("/api/council", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const data = await res.json();
        if (!res.ok || !data.runId) throw new Error(data.error || "Failed to convene the council");
        runId = data.runId;
      } catch (err) {
        commit({ ...stateRef.current, status: "error", phase: "error", error: err instanceof Error ? err.message : "Failed to start" });
        return;
      }
      commit({ ...stateRef.current, runId });

      const es = new EventSource(`/api/council/stream/${runId}`);
      esRef.current = es;
      es.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as CouncilEvent;
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
