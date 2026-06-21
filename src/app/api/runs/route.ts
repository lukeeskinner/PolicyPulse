import { redisHealth, redisListRuns } from "@/lib/redis";
import { listRuns } from "@/lib/runStore";
import type { RunMeta } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const memory = listRuns(20);
  let runs: RunMeta[] = memory;

  // Backfill from Redis when the in-memory store is short (e.g. after a
  // restart or on a fresh process), de-duplicating by runId.
  if (memory.length < 20) {
    const mirrored = await redisListRuns(20);
    const seen = new Set(memory.map((r) => r.runId));
    runs = [...memory, ...mirrored.filter((r) => !seen.has(r.runId))]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
  }

  return Response.json({ runs, redis: redisHealth() });
}
