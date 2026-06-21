import type { NextRequest } from "next/server";
import { pickAuraVoice } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// Deepgram Aura text-to-speech proxy for resident stories. Voices a synthetic
// resident's first-person narrative in a natural Aura voice matched to the
// persona's gender (primary) and age (secondary lean) — never to race.
//
// The DEEPGRAM_API_KEY stays server-side. Graceful degradation matches the
// rest of the app: GET reports whether voice is configured so the UI can hide
// the control, and POST returns 503 (not an error) when no key is set so the
// resident's text story still shows untouched.
// ============================================================================

// Resident stories run ~90-150 words; cap generously to avoid truncating them.
const MAX_CHARS = 1500;

export function GET() {
  return Response.json({ configured: !!process.env.DEEPGRAM_API_KEY });
}

export async function POST(req: NextRequest) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return Response.json({ error: "deepgram_unconfigured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const text = (body?.text ?? "").toString().trim().slice(0, MAX_CHARS);
  if (!text) return Response.json({ error: "text required" }, { status: 400 });

  const age = typeof body?.age === "number" ? body.age : undefined;
  const model = pickAuraVoice(body?.gender, age);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      return Response.json({ error: "deepgram_failed", detail: detail.slice(0, 200) }, { status: 502 });
    }
    return new Response(res.body, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Voice-Model": model,
      },
    });
  } catch {
    return Response.json({ error: "deepgram_unreachable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
