import type { AgentRecord, RunMeta, RunSnapshot, SimEvent } from "./types";

// ============================================================================
// In-memory run store (primary source of truth for the single-process demo).
// Held on globalThis so it survives Next.js dev hot-reloads.
// ============================================================================

interface Store {
  runs: Map<string, RunSnapshot>;
  order: string[];
}

const g = globalThis as unknown as { __pp_store?: Store };
const store: Store = g.__pp_store ?? (g.__pp_store = { runs: new Map(), order: [] });

const MAX_RUNS = 40;

export function createRun(meta: RunMeta): RunSnapshot {
  const snapshot: RunSnapshot = {
    meta,
    publicAgents: [],
    agents: [],
    metricsByRound: [],
    cascades: [],
    events: [],
  };
  store.runs.set(meta.runId, snapshot);
  store.order.unshift(meta.runId);
  // evict old runs
  while (store.order.length > MAX_RUNS) {
    const old = store.order.pop();
    if (old) store.runs.delete(old);
  }
  return snapshot;
}

export function getRun(runId: string): RunSnapshot | undefined {
  return store.runs.get(runId);
}

export function listRuns(limit = 20): RunMeta[] {
  return store.order
    .map((id) => store.runs.get(id)?.meta)
    .filter((m): m is RunMeta => !!m)
    .slice(0, limit);
}

export function getAgent(runId: string, agentId: string): AgentRecord | undefined {
  return store.runs.get(runId)?.agents.find((a) => a.persona.id === agentId);
}

/** Attach the full server-side agent records (with per-round history). */
export function setAgents(runId: string, agents: AgentRecord[]): void {
  const snap = store.runs.get(runId);
  if (snap) snap.agents = agents;
}

/** Update the snapshot incrementally as events stream through the bus. */
export function applyEvent(runId: string, event: SimEvent): void {
  const snap = store.runs.get(runId);
  if (!snap) return;
  snap.events.push(event);
  switch (event.type) {
    case "run_started":
      snap.meta = event.meta;
      snap.policyModel = event.policyModel;
      break;
    case "ingest_complete":
      snap.profile = event.profile;
      break;
    case "agent_spawned":
      snap.publicAgents.push(event.agent);
      break;
    case "metrics":
      snap.metricsByRound.push(event.metrics);
      break;
    case "cascade":
      snap.cascades.push(event.cascade);
      break;
    case "analysis":
      snap.analysis = event.analysis;
      snap.meta.headline = event.analysis.headline;
      break;
    case "run_complete":
      snap.meta.status = "complete";
      break;
    case "error":
      snap.meta.status = "error";
      break;
  }
}
