import { randomUUID } from "node:crypto";

// ============================================================================
// Lightweight Sentry error capture (dependency-free).
//
// Parses SENTRY_DSN and posts error events straight to Sentry's ingestion
// "store" endpoint. Best-effort and fire-and-forget so a monitoring hiccup
// never affects a live run. Scoped to Ghost Protocol so it doesn't touch the
// rest of the app's config.
// ============================================================================

interface Dsn {
  publicKey: string;
  host: string;
  projectId: string;
}

function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)\/?$/);
  if (!m) return null;
  return { publicKey: m[1], host: m[2], projectId: m[3] };
}

export function sentryConfigured(): boolean {
  return !!parseDsn(process.env.SENTRY_DSN);
}

/**
 * Report an error to Sentry. No-op when SENTRY_DSN is unset. Never throws.
 */
export function captureGhostError(err: unknown, extra?: Record<string, unknown>): void {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;

  const error = err instanceof Error ? err : new Error(String(err));
  const event = {
    event_id: randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    logger: "ghost-protocol",
    environment: process.env.NODE_ENV || "development",
    message: { formatted: error.message },
    exception: { values: [{ type: error.name, value: error.message }] },
    tags: { feature: "ghost-protocol" },
    extra: extra ?? {},
  };

  const url = `https://${dsn.host}/api/${dsn.projectId}/store/?sentry_key=${dsn.publicKey}&sentry_version=7`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
    signal: controller.signal,
  })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
}
