import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import type { AgentRole } from "@/lib/ghost/types";

// ============================================================================
// Ghost Protocol reasoning agent (Anthropic Claude).
//
// The deterministic engine chooses each agent's *action* (safe + reproducible).
// This module enriches the *reasoning prose* behind the decision — what the
// agent saw, why it chose what it did, and what it rejected — which is exactly
// what the Arize-style post-mortem visualizes.
//
// Implementation note: we call the Anthropic Messages API directly. The repo's
// Mastra `generate({ structuredOutput })` path errors in this environment
// (the same path the PolicyPulse analyst uses), so the direct call is the
// reliable way to surface genuine Claude reasoning. The Mastra agent below
// stays registered for convention and shares the same system prompt. When
// ANTHROPIC_API_KEY is unset, callers keep the deterministic rationale; a hard
// timeout guarantees a slow/rate-limited model never stalls the live demo.
// ============================================================================

const MODEL = process.env.POLICYPULSE_GHOST_MODEL || process.env.POLICYPULSE_ANALYST_MODEL || "anthropic/claude-haiku-4-5";

const SYSTEM_PROMPT = `You role-play ONE autonomous specialist agent operating inside a live infrastructure-crisis simulation (a power grid, water plant, autonomous fleet, or hospital network under attack).

You are given: your role, the crisis, the world state you just observed, the action you have committed to, and the alternatives on the table.

Produce TERSE, operational, first-person reasoning — the voice of an autonomous system under a hard time budget, not a chatbot:
- "rationale": 1-3 sentences explaining WHY this action, grounded in the world state and any cited incident/advisory. No hedging, no preamble.
- "rejected": up to 3 alternatives you considered and a one-line reason each was wrong.

Be specific and quantitative where the context gives you numbers. Never invent facts beyond the context. Stay in character for your role (e.g. a SecurityAgent talks containment; a CommsAgent talks protection and consensus).`;

export const ghostReasoningAgent = new Agent({
  id: "ghost-reasoner",
  name: "GhostReasoner",
  instructions: `${SYSTEM_PROMPT}\n\nReturn ONLY a structured object.`,
  model: MODEL,
});

export const ghostReasoningSchema = z.object({
  rationale: z.string().describe("1-3 sentence first-person operational rationale for the chosen action"),
  rejected: z
    .array(z.object({ option: z.string(), why: z.string() }))
    .max(3)
    .describe("Alternatives considered and why each was rejected"),
});

export type GhostReasoningInput = {
  role: AgentRole;
  scenarioTitle: string;
  threatType: string;
  context: string;
  chosen: string;
  considered: string[];
  conflict: boolean;
};

export type GhostReasoning = z.infer<typeof ghostReasoningSchema>;

/** Returns the model id used for reasoning, for trace display. */
export function ghostModelId(): string {
  return MODEL.replace("anthropic/", "");
}

function buildUserPrompt(input: GhostReasoningInput): string {
  return `ROLE: ${input.role}
CRISIS: ${input.scenarioTitle} — threat: ${input.threatType}
${input.conflict ? "SITUATION: This decision is part of an active inter-agent conflict.\n" : ""}WORLD STATE YOU OBSERVED:
${input.context}

ACTION YOU COMMITTED TO:
${input.chosen}

ALTERNATIVES ON THE TABLE:
${input.considered.map((c) => `- ${c}`).join("\n")}

Respond with ONLY a JSON object of the form:
{"rationale": "<1-3 sentences, first person>", "rejected": [{"option": "<alternative>", "why": "<one line>"}]}`;
}

function extractJson(text: string): unknown {
  const fenced = text.replace(/```json\s*|```/gi, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Enrich one decision's reasoning with Claude via the Anthropic Messages API.
 * Returns null when no API key is configured or on any error/timeout, so the
 * caller keeps the deterministic rationale. Safe to call in parallel across a
 * tick's agents (Orkes-style fan-out).
 */
export async function enrichReasoning(input: GhostReasoningInput): Promise<GhostReasoning | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ghostModelId(),
        max_tokens: 320,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(input) }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    const parsed = ghostReasoningSchema.safeParse(extractJson(text));
    if (parsed.success && parsed.data.rationale.length > 20) return parsed.data;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
