import { getRedis } from "./redis";

// ============================================================================
// Tiny TTL cache for live API responses.
//
// Two layers, both best-effort:
//   1. in-process Map (survives within a server instance, instant)
//   2. optional Redis string with EX (shared across instances / restarts)
//
// The point is to stay comfortably inside the free tiers of Census / Congress /
// OpenStates / GNews and to keep the demo fast and resilient to flaky upstreams.
// On any cache miss we call the loader, then write through to both layers.
// ============================================================================

interface Entry {
  value: unknown;
  expires: number;
}

const mem = new Map<string, Entry>();

export function cacheKey(...parts: (string | number | null | undefined)[]): string {
  return parts.filter((p) => p != null && p !== "").join(":");
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();

  const hit = mem.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  // Optional shared read.
  try {
    const c = await getRedis();
    if (c) {
      const raw = await c.get(`pp:cache:${key}`);
      if (raw) {
        const value = JSON.parse(raw) as T;
        mem.set(key, { value, expires: now + ttlMs });
        return value;
      }
    }
  } catch {
    /* redis optional */
  }

  const value = await loader();
  mem.set(key, { value, expires: now + ttlMs });

  try {
    const c = await getRedis();
    if (c) {
      await c.set(`pp:cache:${key}`, JSON.stringify(value), {
        EX: Math.max(1, Math.ceil(ttlMs / 1000)),
      });
    }
  } catch {
    /* redis optional */
  }

  return value;
}
