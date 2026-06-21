import type {z} from "zod";

// ============================================================================
// Shared Claude transport.
//
// A thin, dependency-free wrapper over the Anthropic Messages API used by the
// Stakeholder Council brain. Mirrors the proven path in src/lib/ghost/brain.ts
// (the repo's Mastra structured-output path errors in this env), kept separate
// so the working Ghost demo is never touched. Any failure returns null so the
// caller degrades honestly rather than inventing data.
// ============================================================================

const ANALYST_MODEL = process.env.POLICYPULSE_ANALYST_MODEL || "anthropic/claude-sonnet-4-6";

export function claudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Bare model id (no provider prefix) for the Anthropic REST API. */
export function modelId(override?: string): string {
  return (override || ANALYST_MODEL).replace("anthropic/", "");
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json\s*|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function callClaude(
  system: string,
  user: string,
  maxTokens: number,
  timeoutMs = 16000,
): Promise<{text: string; latencyMs: number} | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
      body: JSON.stringify({model: modelId(), max_tokens: maxTokens, system, messages: [{role: "user", content: user}]}),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Surface auth/model misconfig instead of silently degrading to the
      // deterministic fallback (e.g. a stale exported key shadowing .env.local).
      const detail = res.status === 401 ? "invalid ANTHROPIC_API_KEY (a stale exported key may be shadowing .env.local)" : `model=${modelId()}`;
      console.warn(`[llm] Claude request failed (${res.status}): ${detail} — using grounded fallback.`);
      return null;
    }
    const data = (await res.json()) as {content?: {type: string; text?: string}[]};
    const text = data.content?.map((c) => c.text ?? "").join("") ?? "";
    return {text, latencyMs: Date.now() - t0};
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Call Claude and validate the JSON payload against a Zod schema. */
export async function claudeJSON<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
  maxTokens: number,
): Promise<{data: T; latencyMs: number} | null> {
  const r = await callClaude(system, user, maxTokens);
  if (!r) return null;
  const parsed = schema.safeParse(extractJson(r.text));
  if (!parsed.success) return null;
  return {data: parsed.data, latencyMs: r.latencyMs};
}
