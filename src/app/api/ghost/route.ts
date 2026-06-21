import type { NextRequest } from "next/server";
import { runGhostScenario } from "@/lib/ghost/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = (body?.prompt ?? "").toString().trim();
  const scenarioId = (body?.scenarioId ?? "").toString().trim() || undefined;
  const voice = body?.voice !== false;

  if (!prompt) {
    return Response.json({ error: "A crisis scenario description is required." }, { status: 400 });
  }

  const id = runGhostScenario({ prompt, scenarioId, voice });
  return Response.json({ runId: id });
}
