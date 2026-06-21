import { EventEmitter } from "node:events";
import type { SimEvent } from "./types";
import * as runStore from "./runStore";
import { indexRun, sinkEvent, sinkMetric, sinkSnapshotJson } from "./redis";

// ============================================================================
// Event bus: the live spine of a simulation run.
//
// emit() does three things for every event:
//   1. updates the in-memory run snapshot (durable replay),
//   2. fans out to in-process SSE subscribers (instant UI updates),
//   3. mirrors into Redis structures when configured (best-effort).
// ============================================================================

const g = globalThis as unknown as { __pp_emitter?: EventEmitter };
const emitter: EventEmitter = g.__pp_emitter ?? (g.__pp_emitter = new EventEmitter());
emitter.setMaxListeners(0);

type Handler = (event: SimEvent) => void;

export function subscribe(runId: string, handler: Handler): () => void {
  const channel = `run:${runId}`;
  emitter.on(channel, handler);
  return () => emitter.off(channel, handler);
}

export function emit(event: SimEvent): void {
  // 1. durable in-memory snapshot
  runStore.applyEvent(event.runId, event);

  // 2. instant fan-out to SSE subscribers
  emitter.emit(`run:${event.runId}`, event);

  // 3. best-effort Redis mirror (never awaited on the hot path)
  void sinkEvent(event.runId, event);

  if (event.type === "metrics") {
    const m = event.metrics;
    void sinkMetric(event.runId, "rent_burden", event.ts, m.avgRentBurden);
    void sinkMetric(event.runId, "displacement", event.ts, m.displacementRate);
    void sinkMetric(event.runId, "wellbeing", event.ts, m.avgWellbeing);
    void sinkMetric(event.runId, "supply_index", event.ts, m.housingSupplyIndex);
  }

  if (event.type === "run_started" || event.type === "analysis" || event.type === "run_complete") {
    const snap = runStore.getRun(event.runId);
    if (snap) {
      void indexRun(snap.meta);
      void sinkSnapshotJson(event.runId, {
        meta: snap.meta,
        policyModel: snap.policyModel ?? null,
        metricsByRound: snap.metricsByRound,
        analysis: snap.analysis ?? null,
        cascades: snap.cascades,
      });
    }
  }
}
