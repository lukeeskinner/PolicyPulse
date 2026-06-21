import type { NextRequest } from "next/server";
import { runSimulation } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const policy = (body?.policy ?? "").toString().trim();
  const jurisdiction = (body?.jurisdiction ?? "Oakland, CA").toString().trim() || "Oakland, CA";
  let agentCount = Number(body?.agentCount ?? 50);
  if (!Number.isFinite(agentCount)) agentCount = 50;
  agentCount = Math.max(12, Math.min(150, Math.round(agentCount)));
  const stateCode = (body?.stateCode ?? "").toString().trim().toUpperCase() || undefined;

  if (!policy) {
    return Response.json({ error: "A policy description is required." }, { status: 400 });
  }

  const id = runSimulation({ policy, jurisdiction, agentCount, stateCode });
  return Response.json({ runId: id });
}
