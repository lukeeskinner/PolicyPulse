import type { GhostEvent, GhostRunMeta, GhostSnapshot } from "./types";

// ============================================================================
// In-memory Ghost Protocol run store. Held on globalThis so it survives Next.js
// dev hot-reloads. Mirrors PolicyPulse's runStore but typed for GhostEvent.
// ============================================================================

interface Store {
  runs: Map<string, GhostSnapshot>;
  order: string[];
}

const g = globalThis as unknown as { __gp_store?: Store };
const store: Store = g.__gp_store ?? (g.__gp_store = { runs: new Map(), order: [] });

const MAX_RUNS = 40;

export function createRun(meta: GhostRunMeta): GhostSnapshot {
  const snapshot: GhostSnapshot = {
    meta,
    agents: [],
    nodes: [],
    narrations: [],
    messages: [],
    spans: [],
    events: [],
  };
  store.runs.set(meta.runId, snapshot);
  store.order.unshift(meta.runId);
  while (store.order.length > MAX_RUNS) {
    const old = store.order.pop();
    if (old) store.runs.delete(old);
  }
  return snapshot;
}

export function getRun(runId: string): GhostSnapshot | undefined {
  return store.runs.get(runId);
}

export function listRuns(limit = 20): GhostRunMeta[] {
  return store.order
    .map((id) => store.runs.get(id)?.meta)
    .filter((m): m is GhostRunMeta => !!m)
    .slice(0, limit);
}

/** Fold an event into the durable snapshot as it streams through the bus. */
export function applyEvent(runId: string, event: GhostEvent): void {
  const snap = store.runs.get(runId);
  if (!snap) return;
  snap.events.push(event);
  switch (event.type) {
    case "run_started":
      snap.meta = event.meta;
      snap.integrations = event.integrations;
      break;
    case "scenario_parsed":
      snap.scenario = event.scenario;
      break;
    case "orkes_workflow":
      snap.orkes = { workflowId: event.workflowId, url: event.url };
      break;
    case "world_init":
      snap.nodes = event.nodes;
      snap.metrics = event.metrics;
      break;
    case "agents_deployed":
      snap.agents = event.agents;
      break;
    case "world_update":
      snap.nodes = event.nodes;
      snap.metrics = event.metrics;
      break;
    case "narration":
      snap.narrations.push(event.narration);
      break;
    case "neg_message":
      snap.messages.push(event.message);
      break;
    case "trace_span":
      snap.spans.push(event.span);
      break;
    case "postmortem":
      snap.postMortem = event.postMortem;
      break;
    case "resolved":
      snap.meta.outcome = event.outcome;
      break;
    case "run_complete":
      snap.meta.status = "complete";
      break;
    case "error":
      snap.meta.status = "error";
      break;
  }
}
