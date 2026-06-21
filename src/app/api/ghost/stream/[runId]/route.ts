import type { NextRequest } from "next/server";
import { subscribe } from "@/lib/ghost/bus";
import { getRun } from "@/lib/ghost/runStore";
import type { GhostEvent } from "@/lib/ghost/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const snap = getRun(runId);
  if (!snap) return new Response("Run not found", { status: 404 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (data: string): boolean => {
        try {
          controller.enqueue(encoder.encode(data));
          return true;
        } catch {
          return false;
        }
      };
      const send = (event: GhostEvent) => enqueue(`data: ${JSON.stringify(event)}\n\n`);
      const finish = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // 1. replay everything so far (synchronous = race-free)
      for (const e of snap.events) send(e);

      // 2. if the run already finished, close after the backlog
      if (snap.meta.status !== "running") {
        finish();
        return;
      }

      // 3. subscribe for live events
      unsubscribe = subscribe(runId, (event) => {
        send(event);
        if (event.type === "run_complete") finish();
      });

      // 4. heartbeat to keep the connection alive through proxies
      heartbeat = setInterval(() => {
        if (!enqueue(`: ping\n\n`)) finish();
      }, 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
