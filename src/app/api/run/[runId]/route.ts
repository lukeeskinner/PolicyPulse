import type { NextRequest } from "next/server";
import { getRun } from "@/lib/runStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const snap = getRun(runId);
  if (!snap) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json(snap);
}
