import type { NextRequest } from "next/server";
import { getRun } from "@/lib/ghost/runStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const snap = getRun(runId);
  if (!snap) return new Response("Run not found", { status: 404 });

  // Strip the raw event log from the snapshot response; the dashboard hydrates
  // authoritative state from the structured fields.
  const { events: _events, ...rest } = snap;
  void _events;
  return Response.json(rest);
}
