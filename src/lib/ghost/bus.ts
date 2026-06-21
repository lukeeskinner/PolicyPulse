import { EventEmitter } from "node:events";
import * as runStore from "./runStore";
import { indexRun, sinkAgentMemory, sinkEvent, sinkWorldState } from "./redis";
import type { GhostEvent } from "./types";

// ============================================================================
// Ghost Protocol event bus — the live spine of a crisis run.
//
// emit() does three things for every event:
//   1. folds it into the durable in-memory snapshot (race-free SSE replay),
//   2. fans out to in-process SSE subscribers (instant dashboard updates),
//   3. mirrors into Redis structures when configured (best-effort).
// ============================================================================

const g = globalThis as unknown as { __gp_emitter?: EventEmitter };
const emitter: EventEmitter = g.__gp_emitter ?? (g.__gp_emitter = new EventEmitter());
emitter.setMaxListeners(0);

type Handler = (event: GhostEvent) => void;

export function subscribe(runId: string, handler: Handler): () => void {
  const channel = `ghost:${runId}`;
  emitter.on(channel, handler);
  return () => emitter.off(channel, handler);
}

export function emit(event: GhostEvent): void {
  // 1. durable in-memory snapshot
  runStore.applyEvent(event.runId, event);

  // 2. instant fan-out to SSE subscribers
  emitter.emit(`ghost:${event.runId}`, event);

  // 3. best-effort Redis mirror (never awaited on the hot path)
  void sinkEvent(event.runId, event);

  if (event.type === "world_init" || event.type === "world_update") {
    void sinkWorldState(event.runId, event.nodes);
  }
  if (event.type === "trace_span") {
    void sinkAgentMemory(event.runId, event.span.agentId, event.span);
  }
  if (event.type === "run_started" || event.type === "resolved" || event.type === "run_complete") {
    const snap = runStore.getRun(event.runId);
    if (snap) void indexRun(snap.meta);
  }
}
