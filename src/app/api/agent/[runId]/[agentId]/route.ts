import type { NextRequest } from "next/server";
import { getAgent, getRun } from "@/lib/runStore";
import { narrateResident } from "@/mastra/agents/resident";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string; agentId: string }> },
) {
  const { runId, agentId } = await params;
  const snap = getRun(runId);
  const record = getAgent(runId, agentId);
  if (!snap || !record) return Response.json({ error: "Agent not found" }, { status: 404 });
  if (!snap.policyModel) return Response.json({ error: "Run not ready" }, { status: 409 });

  const { story, source } = await narrateResident(record, snap.policyModel);
  return Response.json({
    persona: record.persona,
    history: record.history,
    outcome: record.outcome,
    impactScore: record.impactScore,
    story,
    source,
  });
}
