import { Agent } from "@mastra/core/agent";

// ============================================================================
// Ghost Protocol agent — registered in the Mastra instance for convention and
// visibility. The live brain (world design + per-tick agent decisions +
// negotiation) calls the Anthropic Messages API directly from
// src/lib/ghost/brain.ts, because the repo's Mastra structured-output path
// errors in this environment.
// ============================================================================

const MODEL = process.env.POLICYPULSE_GHOST_MODEL || process.env.POLICYPULSE_ANALYST_MODEL || "anthropic/claude-haiku-4-5";

export const ghostReasoningAgent = new Agent({
  id: "ghost-reasoner",
  name: "GhostReasoner",
  instructions:
    "You are an autonomous specialist agent operating inside a live infrastructure-crisis simulation. You observe a structured world, reason about it, and choose actions to resolve the crisis while protecting critical infrastructure.",
  model: MODEL,
});
