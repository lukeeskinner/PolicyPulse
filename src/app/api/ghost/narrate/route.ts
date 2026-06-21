import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// Deepgram Aura text-to-speech proxy. Converts a narration line into spoken
// audio for the "voice of mission control". Returns 503 (not an error) when no
// DEEPGRAM_API_KEY is set, so the client falls back to the browser Web Speech
// API and then to silent text.
// ============================================================================

const MODEL = process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en";

export async function POST(req: NextRequest) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return Response.json({ error: "deepgram_unconfigured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const text = (body?.text ?? "").toString().trim().slice(0, 600);
  if (!text) return Response.json({ error: "text required" }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(MODEL)}`, {
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
      },
    });
  } catch {
    return Response.json({ error: "deepgram_unreachable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
