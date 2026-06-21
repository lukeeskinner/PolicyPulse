import { redisHealth } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    redis: redisHealth(),
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    browserbase: !!process.env.BROWSERBASE_API_KEY && process.env.ENABLE_BROWSERBASE === "1",
  });
}
