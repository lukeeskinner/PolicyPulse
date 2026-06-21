import { caps, getRedis, redisConfigured } from "@/lib/redis";
import type { GhostEvent, GhostRunMeta, TraceSpan, WorldNode } from "./types";

// ============================================================================
// Ghost Protocol Redis mirror (optional, best-effort).
//
// Reuses PolicyPulse's Redis connection to make Ghost Protocol's world the
// simulation "nervous system":
//   - Streams       gp:run:{id}:events       full event log (durable replay)
//   - JSON          gp:run:{id}:state        evolving world state
//   - Hash          gp:run:{id}:agent:{aid}  per-agent memory namespace
//   - Sorted Set    gp:run:{id}:timeline     events scored by tick (temporal)
//   - Pub/Sub       gp:run:{id}              cross-process fan-out
//   - Search/Hash   gp:run:{id}:meta         indexed run metadata
//
// Every call degrades silently when REDIS_URL is unset or a module is missing.
// ============================================================================

const key = {
  events: (id: string) => `gp:run:${id}:events`,
  state: (id: string) => `gp:run:${id}:state`,
  agent: (id: string, aid: string) => `gp:run:${id}:agent:${aid}`,
  timeline: (id: string) => `gp:run:${id}:timeline`,
  meta: (id: string) => `gp:run:${id}:meta`,
  channel: (id: string) => `gp:run:${id}`,
  runs: "gp:runs",
};

export function ghostRedisConfigured(): boolean {
  return redisConfigured();
}

export async function sinkEvent(runId: string, event: GhostEvent): Promise<void> {
  const c = await getRedis();
  if (!c) return;
  const payload = JSON.stringify(event);
  try {
    await c.xAdd(key.events(runId), "*", { type: event.type, data: payload }, { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 5000 } });
  } catch {
    /* stream unavailable */
  }
  try {
    await c.publish(key.channel(runId), payload);
  } catch {
    /* pub/sub unavailable */
  }
  // Temporal index: score significant events by tick for time-travel queries.
  if ("tick" in event && typeof event.tick === "number") {
    try {
      await c.zAdd(key.timeline(runId), { score: event.tick, value: `${event.type}:${event.ts}` });
    } catch {
      /* zset unavailable */
    }
  }
}

export async function sinkWorldState(runId: string, nodes: WorldNode[]): Promise<void> {
  const c = await getRedis();
  if (!c || !caps.json) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (c as any).json.set(key.state(runId), "$", nodes as object);
  } catch {
    caps.json = false;
  }
}

export async function sinkAgentMemory(runId: string, agentId: string, span: TraceSpan): Promise<void> {
  const c = await getRedis();
  if (!c) return;
  try {
    await c.hSet(key.agent(runId, agentId), {
      lastTick: String(span.tick),
      lastAction: span.chosen,
      lastRationale: span.rationale.slice(0, 480),
      source: span.source,
      worldHash: span.worldHash,
    });
  } catch {
    /* hash unavailable */
  }
}

export async function indexRun(meta: GhostRunMeta): Promise<void> {
  const c = await getRedis();
  if (!c) return;
  try {
    await c.hSet(key.meta(meta.runId), {
      runId: meta.runId,
      prompt: meta.prompt.slice(0, 280),
      scenarioId: meta.scenarioId,
      title: meta.title,
      status: meta.status,
      outcome: meta.outcome ?? "",
      createdAt: String(meta.createdAt),
    });
    await c.zAdd(key.runs, { score: meta.createdAt, value: meta.runId });
  } catch {
    /* hash/zset unavailable */
  }
}
