import { EventEmitter } from "node:events";
import type { CouncilEvent, CouncilRunMeta, CouncilSnapshot } from "./types";

// ============================================================================
// Stakeholder Council event spine. emit() folds each event into a durable
// in-memory snapshot (race-free SSE replay) and fans out to live subscribers.
// Held on globalThis so it survives Next.js dev hot-reloads. Mirrors the Ghost
// Protocol bus, kept separate so the two demos never interfere.
// ============================================================================

interface Store {
  runs: Map<string, CouncilSnapshot>;
  order: string[];
}

const g = globalThis as unknown as { __council_store?: Store; __council_emitter?: EventEmitter };
const store: Store = g.__council_store ?? (g.__council_store = { runs: new Map(), order: [] });
const emitter: EventEmitter = g.__council_emitter ?? (g.__council_emitter = new EventEmitter());
emitter.setMaxListeners(0);

const MAX_RUNS = 40;

export function createRun(meta: CouncilRunMeta): CouncilSnapshot {
  const snapshot: CouncilSnapshot = {
    meta,
    stakeholders: [],
    positions: [],
    messages: [],
    amendments: [],
    spans: [],
    narrations: [],
    votes: [],
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

export function getRun(runId: string): CouncilSnapshot | undefined {
  return store.runs.get(runId);
}

export function listRuns(limit = 20): CouncilRunMeta[] {
  return store.order
    .map((id) => store.runs.get(id)?.meta)
    .filter((m): m is CouncilRunMeta => !!m)
    .slice(0, limit);
}

export function subscribe(runId: string, handler: (event: CouncilEvent) => void): () => void {
  const channel = `council:${runId}`;
  emitter.on(channel, handler);
  return () => emitter.off(channel, handler);
}

function applyEvent(snap: CouncilSnapshot, e: CouncilEvent): void {
  snap.events.push(e);
  switch (e.type) {
    case "run_started":
      snap.meta = e.meta;
      snap.integrations = e.integrations;
      break;
    case "grounding_ready":
      snap.brief = e.brief;
      break;
    case "council_convened":
      snap.stakeholders = e.stakeholders;
      break;
    case "position":
      snap.positions.push(e.position);
      break;
    case "debate_msg":
      snap.messages.push(e.message);
      break;
    case "amendment_proposed":
      if (!snap.amendments.some((a) => a.id === e.amendment.id)) snap.amendments.push(e.amendment);
      break;
    case "amendment_adopted": {
      const i = snap.amendments.findIndex((a) => a.id === e.amendment.id);
      if (i >= 0) snap.amendments[i] = e.amendment;
      else snap.amendments.push(e.amendment);
      break;
    }
    case "trace_span":
      snap.spans.push(e.span);
      break;
    case "amendment_impact":
      snap.impact = e.impact;
      break;
    case "vote":
      snap.votes.push(e.vote);
      break;
    case "verdict":
      snap.verdict = e.verdict;
      snap.meta.outcome = e.verdict.outcome;
      break;
    case "narration":
      snap.narrations.push(e.narration);
      break;
    case "run_complete":
      if (snap.meta.status === "running") snap.meta.status = "complete";
      break;
    case "error":
      snap.meta.status = "error";
      break;
  }
}

export function emit(event: CouncilEvent): void {
  const snap = store.runs.get(event.runId);
  if (snap) applyEvent(snap, event);
  emitter.emit(`council:${event.runId}`, event);
}
