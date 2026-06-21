import type { NextRequest } from "next/server";
import { runCouncilDeliberation } from "@/lib/council/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const policy = (body?.policy ?? "").toString().trim();
  const jurisdiction = (body?.jurisdiction ?? "").toString().trim();
  const stateCode = (body?.stateCode ?? "").toString().trim() || undefined;
  const agentCount = Number.isFinite(body?.agentCount) ? Number(body.agentCount) : undefined;
  const voice = body?.voice !== false;

  if (policy.length < 8) {
    return Response.json({ error: "Describe a bill or policy (at least a sentence) to convene the council." }, { status: 400 });
  }
  if (!jurisdiction) {
    return Response.json({ error: "A jurisdiction is required to ground the population." }, { status: 400 });
  }

  const id = runCouncilDeliberation({ policy, jurisdiction, stateCode, agentCount, voice });
  return Response.json({ runId: id });
}
