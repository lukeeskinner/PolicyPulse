import { ghostRedisConfigured } from "./redis";
import type { IntegrationStatus } from "./types";

// ============================================================================
// Which sponsor surfaces are live (real keyed SDK) vs. native fallback.
//
// "live"  — a real external SDK/API is wired and keyed.
// "native"— the load-bearing behavior is implemented in-app (the documented
//           fallback for Python-only frameworks that can't run in a Next.js
//           route), with an adapter seam ready for the real SDK.
// ============================================================================

export function integrationStatus(): IntegrationStatus {
  const fetchai = process.env.FETCHAI_AGENTVERSE_KEY ? "live" : "native";
  const orkes = process.env.ORKES_SERVER_URL && process.env.ORKES_KEY_ID ? "live" : "native";
  const arize = process.env.ARIZE_API_KEY || process.env.PHOENIX_COLLECTOR_ENDPOINT ? "live" : "native";
  const simular = process.env.ENABLE_SIMULAR === "1" ? "gui" : "json";
  return {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    deepgram: !!process.env.DEEPGRAM_API_KEY,
    redis: ghostRedisConfigured(),
    browserbase: !!process.env.BROWSERBASE_API_KEY && !!process.env.BROWSERBASE_PROJECT_ID && process.env.ENABLE_BROWSERBASE === "1",
    fetchai,
    orkes,
    arize,
    simular,
    cognition: process.env.DISABLE_COGNITION === "1" ? false : true,
  };
}
