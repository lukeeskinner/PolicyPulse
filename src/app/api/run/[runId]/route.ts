import type { NextRequest } from "next/server";
import { redisGetSnapshot } from "@/lib/redis";
import { getRun } from "@/lib/runStore";
import type { RunSnapshot } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  // Primary: the in-memory snapshot (full fidelity, including agents).
  const snap = getRun(runId);
  if (snap) return Response.json(snap);

  // Fallback: a Redis-mirrored snapshot (survives restarts / other processes).
  // It carries metrics + analysis + policy but not per-agent history, so the
  // dashboard degrades to the charts and inequality view without the grid.
  const mirrored = await redisGetSnapshot(runId);
  if (mirrored) {
    const restored: RunSnapshot = {
      meta: mirrored.meta,
      policyModel: mirrored.policyModel ?? undefined,
      profile: undefined,
      publicAgents: [],
      agents: [],
      metricsByRound: mirrored.metricsByRound ?? [],
      cascades: mirrored.cascades ?? [],
      analysis: mirrored.analysis ?? undefined,
      events: [],
    };
    return Response.json(restored);
  }

  return Response.json({ error: "Run not found" }, { status: 404 });
}
