import { integrationStatus } from "@/lib/ghost/integrations";
import { redisHealth } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    integrations: integrationStatus(),
    redis: redisHealth(),
  });
}
