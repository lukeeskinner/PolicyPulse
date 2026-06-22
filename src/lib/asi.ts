import {z} from "zod";

// ============================================================================
// Shared ASI-1 transport (Fetch.ai).
//
// A thin, dependency-free wrapper over the ASI-1 chat-completions API, which is
// OpenAI-compatible: POST https://api.asi1.ai/v1/chat/completions with Bearer
// auth. Mirrors the proven REST path in src/lib/llm.ts (the repo's Mastra
// structured-output path errors in this env), so the three PolicyPulse LLM
// agents — PolicyAnalyst, Resident, Advocate — can run on ASI-1 instead of
// Claude with identical inputs/outputs. Any failure returns null so callers
// degrade honestly to the heuristic / template path.
//
// Server-side only: ASI_ONE_API_KEY is never exposed to the browser.
// ============================================================================

const BASE = process.env.ASI_ONE_BASE_URL || "https://api.asi1.ai/v1";
const DEFAULT_MODEL = process.env.POLICYPULSE_ASI_MODEL || "asi1-mini";

export function asiConfigured(): boolean {
  return !!process.env.ASI_ONE_API_KEY;
}

// ASI-1 (like most OpenAI-compatible models) emits `null` for inapplicable
// OPTIONAL fields instead of omitting them — e.g. wageTarget: null on a
// rent-control bill. Zod's .optional() accepts `undefined`, not `null`, so we
// drop null-valued keys before validation. Our schemas have no nullable
// required fields, so this only turns "null optional" into "absent optional".
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) continue;
      out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

/** Pull the first JSON object out of a model response (handles ```json fences). */
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

interface ASIOptions {
  maxTokens?: number;
  temperature?: number;
  /** Ask ASI-1 for a JSON object via the OpenAI-compatible response_format. */
  json?: boolean;
  timeoutMs?: number;
}

export async function callASI(
  system: string,
  user: string,
  opts: ASIOptions = {},
): Promise<{text: string; latencyMs: number} | null> {
  const key = process.env.ASI_ONE_API_KEY;
  if (!key) return null;
  const {maxTokens = 1024, temperature = 0.7, json = false, timeoutMs = 20000} = opts;

  const t0 = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: maxTokens,
        temperature,
        ...(json ? {response_format: {type: "json_object"}} : {}),
        messages: [
          {role: "system", content: system},
          {role: "user", content: user},
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail =
        res.status === 401
          ? "invalid ASI_ONE_API_KEY (a stale exported key may be shadowing .env.local)"
          : `model=${DEFAULT_MODEL}`;
      console.warn(`[asi] ASI-1 request failed (${res.status}): ${detail} — using grounded fallback.`);
      return null;
    }
    // OpenAI-compatible shape: { choices: [{ message: { content } }] }
    const data = (await res.json()) as {
      choices?: {message?: {content?: string}}[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return {text, latencyMs: Date.now() - t0};
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call ASI-1 in JSON mode and validate the payload against a Zod schema.
 *
 * Mastra's structured-output path used to inject the target schema for the
 * model; calling the REST API directly we replicate that by embedding the
 * schema's JSON-Schema in the system prompt so ASI-1 returns the exact shape
 * our Zod schema expects. Agents keep their original prompts unchanged.
 */
export async function asiJSON<T>(
  system: string,
  user: string,
  schema: z.ZodType<T>,
  maxTokens = 1024,
): Promise<{data: T; latencyMs: number} | null> {
  let contract = "";
  try {
    const jsonSchema = z.toJSONSchema(schema);
    contract =
      `\n\nReturn ONLY a single JSON object that conforms exactly to this JSON Schema ` +
      `(use these exact field names, types, and ranges; no extra keys, no prose, no markdown):\n` +
      JSON.stringify(jsonSchema);
  } catch {
    /* older zod without toJSONSchema — rely on the prompt's field guidance */
  }
  const r = await callASI(system + contract, user, {json: true, maxTokens, temperature: 0.3});
  if (!r) return null;
  const parsed = schema.safeParse(stripNulls(extractJson(r.text)));
  if (!parsed.success) {
    console.warn(`[asi] ASI-1 JSON failed schema validation — using grounded fallback.`);
    return null;
  }
  return {data: parsed.data, latencyMs: r.latencyMs};
}
