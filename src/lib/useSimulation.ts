"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROUNDS,
  type Analysis,
  type CascadeRecord,
  type DemographicProfile,
  type Outcome,
  type PolicyModel,
  type PublicAgent,
  type RoundDef,
  type RoundMetrics,
  type RunMeta,
  type RunSnapshot,
  type SimEvent,
  type SimRequest,
  type SourceRef,
  type AgentState,
} from "./types";

export type Phase =
  | "idle"
  | "analyzing"
  | "ingesting"
  | "spawning"
  | "simulating"
  | "finalizing"
  | "done"
  | "error";

export interface AgentView extends PublicAgent {
  state?: AgentState;
  decision?: string;
  note?: string;
  lastFlags: string[];
  outcome?: Outcome;
  impactScore?: number;
}

export interface TickerItem {
  id: string;
  tone: "good" | "bad" | "warn" | "neutral";
  text: string;
  round?: number;
}

export interface SimState {
  status: "idle" | "running" | "complete" | "error";
  phase: Phase;
  runId?: string;
  meta?: RunMeta;
  policyModel?: PolicyModel;
  profile?: DemographicProfile;
  sources: SourceRef[];
  rounds: RoundDef[];
  currentRound: number;
  agents: AgentView[];
  agentIndex: Record<string, number>;
  breakdown: Record<string, number>;
  total: number;
  spawned: number;
  metrics: RoundMetrics[];
  cascades: CascadeRecord[];
  ticker: TickerItem[];
  analysis?: Analysis;
  snapshot?: RunSnapshot;
  error?: string;
}

const INITIAL: SimState = {
  status: "idle",
  phase: "idle",
  sources: [],
  rounds: [],
  currentRound: -2,
  agents: [],
  agentIndex: {},
  breakdown: {},
  total: 0,
  spawned: 0,
  metrics: [],
  cascades: [],
  ticker: [],
};

let tickerSeq = 0;

function clone(s: SimState): SimState {
  return {
    ...s,
    sources: [...s.sources],
    agents: [...s.agents],
    agentIndex: { ...s.agentIndex },
    metrics: [...s.metrics],
    cascades: [...s.cascades],
    ticker: [...s.ticker],
  };
}

function pushTicker(draft: SimState, item: Omit<TickerItem, "id">) {
  draft.ticker = [{ id: `t${tickerSeq++}`, ...item }, ...draft.ticker].slice(0, 60);
}

function applyEvent(draft: SimState, e: SimEvent) {
  switch (e.type) {
    case "run_started":
      draft.status = "running";
      draft.phase = "ingesting";
      draft.meta = e.meta;
      draft.policyModel = e.policyModel;
      draft.rounds = e.rounds;
      draft.total = e.meta.agentCount;
      break;
    case "ingest_source":
      draft.sources = [...draft.sources, e.source];
      break;
    case "ingest_complete":
      draft.profile = e.profile;
      draft.phase = "spawning";
      break;
    case "agent_spawned": {
      const view: AgentView = { ...e.agent, lastFlags: [] };
      draft.agentIndex[e.agent.id] = draft.agents.length;
      draft.agents = [...draft.agents, view];
      draft.spawned = draft.agents.length;
      draft.total = e.total;
      break;
    }
    case "spawn_complete":
      draft.breakdown = e.breakdown;
      draft.total = e.total;
      draft.phase = "simulating";
      break;
    case "round_started":
      draft.currentRound = e.round.index;
      break;
    case "agent_update": {
      const idx = draft.agentIndex[e.agentId];
      if (idx != null) {
        const prev = draft.agents[idx];
        const next: AgentView = {
          ...prev,
          state: e.state,
          decision: e.decision,
          note: e.note,
          lastFlags: e.state.flags,
        };
        draft.agents[idx] = next;
        // notable personal events -> ticker
        const f = e.state.flags;
        if (f.includes("left_city"))
          pushTicker(draft, { tone: "bad", text: `${prev.name} was priced out and left the city.`, round: e.round });
        else if (f.includes("displaced"))
          pushTicker(draft, { tone: "bad", text: `${prev.name} was displaced from ${prev.neighborhood}.`, round: e.round });
        else if (f.includes("job_loss"))
          pushTicker(draft, { tone: "bad", text: `${prev.name} lost their job.`, round: e.round });
        else if (f.includes("business_closed"))
          pushTicker(draft, { tone: "warn", text: `${prev.name} closed their business.`, round: e.round });
        else if (f.includes("wage_raise"))
          pushTicker(draft, { tone: "good", text: `${prev.name} got a raise toward the new wage floor.`, round: e.round });
      }
      break;
    }
    case "cascade":
      draft.cascades = [...draft.cascades, e.cascade];
      pushTicker(draft, {
        tone:
          e.cascade.kind === "landlord_exit" ||
          e.cascade.kind === "business_closed" ||
          e.cascade.kind === "redevelopment"
            ? "bad"
            : "warn",
        text: e.cascade.description,
        round: e.cascade.round,
      });
      break;
    case "metrics": {
      const existing = draft.metrics.findIndex((m) => m.round === e.metrics.round);
      if (existing >= 0) draft.metrics[existing] = e.metrics;
      else draft.metrics = [...draft.metrics, e.metrics];
      break;
    }
    case "analysis":
      draft.analysis = e.analysis;
      draft.phase = "finalizing";
      break;
    case "run_complete":
      if (draft.status === "running") draft.status = "complete";
      if (draft.phase !== "error") draft.phase = "done";
      break;
    case "error":
      draft.status = "error";
      draft.phase = "error";
      draft.error = e.message;
      break;
  }
}

export function useSimulation() {
  const [state, setState] = useState<SimState>(INITIAL);
  const stateRef = useRef<SimState>(INITIAL);
  const esRef = useRef<EventSource | null>(null);
  const bufferRef = useRef<SimEvent[]>([]);
  const rafRef = useRef<number | null>(null);

  const commit = useCallback((next: SimState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const flush = useCallback(() => {
    rafRef.current = null;
    const events = bufferRef.current;
    if (!events.length) return;
    bufferRef.current = [];
    const draft = clone(stateRef.current);
    for (const e of events) applyEvent(draft, e);
    commit(draft);
  }, [commit]);

  const schedule = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const hydrateSnapshot = useCallback(
    async (runId: string) => {
      try {
        const res = await fetch(`/api/run/${runId}`);
        if (!res.ok) return;
        const snap: RunSnapshot = await res.json();
        const draft = clone(stateRef.current);
        draft.snapshot = snap;
        if (snap.analysis) draft.analysis = snap.analysis;
        if (snap.profile) draft.profile = snap.profile;
        if (snap.policyModel) draft.policyModel = snap.policyModel;
        if (snap.metricsByRound?.length) draft.metrics = snap.metricsByRound;
        // hydrate per-agent outcomes from authoritative records
        for (const rec of snap.agents) {
          const idx = draft.agentIndex[rec.persona.id];
          if (idx != null) {
            draft.agents[idx] = {
              ...draft.agents[idx],
              state: rec.current,
              outcome: rec.outcome,
              impactScore: rec.impactScore,
              lastFlags: rec.current.flags,
            };
          }
        }
        draft.status = "complete";
        draft.phase = "done";
        commit(draft);
      } catch {
        /* keep live state */
      }
    },
    [commit],
  );

  // Cold-load a finished run from its snapshot (shareable permalink). Unlike
  // hydrateSnapshot, this rebuilds the whole view (agents included) from the
  // persisted snapshot rather than assuming a live stream populated it first.
  const loadSnapshot = useCallback(
    async (runId: string): Promise<boolean> => {
      if (esRef.current) esRef.current.close();
      esRef.current = null;
      try {
        const res = await fetch(`/api/run/${runId}`);
        if (!res.ok) return false;
        const snap: RunSnapshot = await res.json();

        const draft = clone(INITIAL);
        draft.status = "complete";
        draft.phase = "done";
        draft.runId = runId;
        draft.meta = snap.meta;
        draft.policyModel = snap.policyModel;
        draft.profile = snap.profile;
        draft.sources = snap.profile?.sources ?? [];
        draft.rounds = ROUNDS;
        draft.metrics = snap.metricsByRound ?? [];
        draft.cascades = snap.cascades ?? [];
        draft.analysis = snap.analysis;
        draft.snapshot = snap;

        // Rebuild the live-feed log from the persisted cascades so a shared
        // permalink shows the real second-order effects, not a blank feed.
        draft.ticker = (snap.cascades ?? [])
          .map((c) => ({
            id: `t${tickerSeq++}`,
            tone:
              c.kind === "landlord_exit" || c.kind === "business_closed" || c.kind === "redevelopment"
                ? ("bad" as const)
                : ("warn" as const),
            text: c.description,
            round: c.round,
          }))
          .reverse();

        const recById = new Map(snap.agents.map((a) => [a.persona.id, a]));
        draft.agentIndex = {};
        draft.agents = snap.publicAgents.map((pa, i) => {
          draft.agentIndex[pa.id] = i;
          const rec = recById.get(pa.id);
          return {
            ...pa,
            lastFlags: rec?.current.flags ?? [],
            state: rec?.current,
            outcome: rec?.outcome,
            impactScore: rec?.impactScore,
          };
        });
        draft.total = snap.meta.agentCount || draft.agents.length;
        draft.spawned = draft.agents.length;
        commit(draft);
        return true;
      } catch {
        return false;
      }
    },
    [commit],
  );

  const reset = useCallback(() => {
    if (esRef.current) esRef.current.close();
    esRef.current = null;
    bufferRef.current = [];
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    commit(INITIAL);
  }, [commit]);

  const start = useCallback(
    async (req: SimRequest) => {
      if (esRef.current) esRef.current.close();
      bufferRef.current = [];
      commit({ ...INITIAL, status: "running", phase: "analyzing" });
      let runId: string;
      try {
        const res = await fetch("/api/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const data = await res.json();
        if (!res.ok || !data.runId) throw new Error(data.error || "Failed to start simulation");
        runId = data.runId;
      } catch (err) {
        commit({ ...stateRef.current, status: "error", phase: "error", error: err instanceof Error ? err.message : "Failed to start" });
        return;
      }
      commit({ ...stateRef.current, runId });

      const es = new EventSource(`/api/stream/${runId}`);
      esRef.current = es;
      es.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as SimEvent;
          bufferRef.current.push(event);
          schedule();
          if (event.type === "run_complete") {
            es.close();
            esRef.current = null;
            // flush remaining then hydrate authoritative snapshot
            requestAnimationFrame(() => {
              flush();
              void hydrateSnapshot(runId);
            });
          }
        } catch {
          /* ignore malformed */
        }
      };
      es.onerror = () => {
        if (stateRef.current.status === "running") {
          // stream dropped before completion; try to hydrate whatever exists
          void hydrateSnapshot(runId);
        }
      };
    },
    [commit, schedule, flush, hydrateSnapshot],
  );

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { state, start, reset, loadSnapshot };
}
