import type { NextRequest } from "next/server";
import { prepare, sensitivity } from "@/lib/headless";
import type { SweepParam } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARAMS: SweepParam[] = [
  "intensity",
  "supplyElasticity",
  "rentCapPct",
  "wageTarget",
  "marketRentGrowthPct",
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const policy = (body?.policy ?? "").toString().trim();
  const jurisdiction = (body?.jurisdiction ?? "Oakland, CA").toString().trim() || "Oakland, CA";
  const stateCode = (body?.stateCode ?? "").toString().trim().toUpperCase() || undefined;

  let agentCount = Number(body?.agentCount ?? 60);
  if (!Number.isFinite(agentCount)) agentCount = 60;
  agentCount = Math.max(12, Math.min(120, Math.round(agentCount)));

  let drawsPerPoint = Number(body?.drawsPerPoint ?? 10);
  if (!Number.isFinite(drawsPerPoint)) drawsPerPoint = 10;
  drawsPerPoint = Math.max(4, Math.min(30, Math.round(drawsPerPoint)));

  const rawParam = (body?.param ?? "").toString().trim();
  const param = PARAMS.includes(rawParam as SweepParam) ? (rawParam as SweepParam) : undefined;

  if (!policy || policy.length < 8) {
    return Response.json({ error: "A policy description is required." }, { status: 400 });
  }

  try {
    const prepared = await prepare({ policy, jurisdiction, stateCode });
    const seedPrefix = `sens:${jurisdiction}:${policy}:${agentCount}`;
    const result = sensitivity(prepared, agentCount, drawsPerPoint, jurisdiction, seedPrefix, param);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sensitivity sweep failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
