import { createClient, type RedisClientType } from "redis";
import type { Analysis, CascadeRecord, PolicyModel, RoundMetrics, RunMeta, SimEvent } from "./types";

export interface RedisSnapshot {
  meta: RunMeta;
  policyModel: PolicyModel | null;
  metricsByRound: RoundMetrics[];
  analysis: Analysis | null;
  cascades: CascadeRecord[];
}

// ============================================================================
// Redis "nervous system" (optional, best-effort).
//
// When REDIS_URL is set, PolicyPulse mirrors every run into Redis to showcase
// its data structures:
//   - Streams      pp:run:{id}:events    full event log (durable replay)
//   - JSON         pp:run:{id}:snapshot  the evolving run snapshot
//   - TimeSeries   pp:ts:{id}:{metric}   live metric trends
//   - Search/Hash  pp:run:{id}:meta      indexed run metadata
//   - Pub/Sub      pp:run:{id}           live fan-out across processes
//
// Every call is wrapped so a missing server (or missing Redis Stack modules)
// silently degrades: the app runs fully in-memory without Redis.
// ============================================================================

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType | null> | null = null;
let enabled = !!process.env.REDIS_URL;

export const caps = { connected: false, json: true, ts: true, ft: true };

export function redisConfigured(): boolean {
  return !!process.env.REDIS_URL;
}

export async function getRedis(): Promise<RedisClientType | null> {
  if (!enabled) return null;
  if (client) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    try {
      const c = createClient({ url: process.env.REDIS_URL });
      c.on("error", () => {
        /* swallow transient errors; health is reported via caps.connected */
      });
      await c.connect();
      client = c as unknown as RedisClientType;
      caps.connected = true;
      return client;
    } catch {
      enabled = false;
      caps.connected = false;
      return null;
    }
  })();
  return connecting;
}

export function redisHealth() {
  return { configured: redisConfigured(), ...caps };
}

const key = {
  events: (id: string) => `pp:run:${id}:events`,
  snapshot: (id: string) => `pp:run:${id}:snapshot`,
  meta: (id: string) => `pp:run:${id}:meta`,
  ts: (id: string, metric: string) => `pp:ts:${id}:${metric}`,
  channel: (id: string) => `pp:run:${id}`,
  runs: "pp:runs",
};

// --- writes (best-effort) ---------------------------------------------------

export async function sinkEvent(runId: string, event: SimEvent): Promise<void> {
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
}

export async function sinkSnapshotJson(runId: string, snapshot: unknown): Promise<void> {
  const c = await getRedis();
  if (!c || !caps.json) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (c as any).json.set(key.snapshot(runId), "$", snapshot as object);
  } catch {
    caps.json = false;
  }
}

export async function sinkMetric(
  runId: string,
  metric: string,
  ts: number,
  value: number,
): Promise<void> {
  const c = await getRedis();
  if (!c || !caps.ts) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (c as any).ts.add(key.ts(runId, metric), ts, value, { DUPLICATE_POLICY: "LAST" });
  } catch {
    caps.ts = false;
  }
}

export async function indexRun(meta: RunMeta): Promise<void> {
  const c = await getRedis();
  if (!c) return;
  try {
    await c.hSet(key.meta(meta.runId), {
      runId: meta.runId,
      policy: meta.policy.slice(0, 280),
      jurisdiction: meta.jurisdiction,
      status: meta.status,
      headline: meta.headline ?? "",
      createdAt: String(meta.createdAt),
    });
    await c.zAdd(key.runs, { score: meta.createdAt, value: meta.runId });
  } catch {
    /* hash/zset unavailable */
  }
}

// --- reads (best-effort cross-process) --------------------------------------

export async function redisGetSnapshot(runId: string): Promise<RedisSnapshot | null> {
  const c = await getRedis();
  if (!c || !caps.json) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await (c as any).json.get(key.snapshot(runId));
    if (!data || typeof data !== "object") return null;
    return data as RedisSnapshot;
  } catch {
    return null;
  }
}

export async function redisListRuns(limit = 20): Promise<RunMeta[]> {
  const c = await getRedis();
  if (!c) return [];
  try {
    const ids = await c.zRange(key.runs, 0, limit - 1, { REV: true });
    const out: RunMeta[] = [];
    for (const id of ids) {
      const h = await c.hGetAll(key.meta(id));
      if (h && h.runId) {
        out.push({
          runId: h.runId,
          policy: h.policy,
          jurisdiction: h.jurisdiction,
          agentCount: 0,
          createdAt: Number(h.createdAt) || 0,
          status: (h.status as RunMeta["status"]) || "complete",
          headline: h.headline,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
