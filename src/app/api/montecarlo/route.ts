import type { NextRequest } from "next/server";
import { monteCarlo, prepare } from "@/lib/headless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const policy = (body?.policy ?? "").toString().trim();
  const jurisdiction = (body?.jurisdiction ?? "Oakland, CA").toString().trim() || "Oakland, CA";
  const stateCode = (body?.stateCode ?? "").toString().trim().toUpperCase() || undefined;

  let agentCount = Number(body?.agentCount ?? 60);
  if (!Number.isFinite(agentCount)) agentCount = 60;
  agentCount = Math.max(12, Math.min(120, Math.round(agentCount)));

  let draws = Number(body?.draws ?? 40);
  if (!Number.isFinite(draws)) draws = 40;
  draws = Math.max(10, Math.min(120, Math.round(draws)));

  if (!policy || policy.length < 8) {
    return Response.json({ error: "A policy description is required." }, { status: 400 });
  }

  try {
    const prepared = await prepare({ policy, jurisdiction, stateCode });
    const seedPrefix = `mc:${jurisdiction}:${policy}:${agentCount}`;
    const result = monteCarlo(prepared, agentCount, draws, jurisdiction, seedPrefix);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Monte Carlo run failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
