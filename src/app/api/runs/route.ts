import { redisHealth } from "@/lib/redis";
import { listRuns } from "@/lib/runStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ runs: listRuns(20), redis: redisHealth() });
}
