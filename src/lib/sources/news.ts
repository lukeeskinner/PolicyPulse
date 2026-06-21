import type { NewsArticle } from "../civic";

// ============================================================================
// Real local news via the GNews API. We scope the search to the user's city
// and state so the rail reads as "news around you". Free tier works in
// production; callers cache to respect the daily quota.
// ============================================================================

function key(): string {
  return process.env.GNEWS_API_KEY || "";
}

export function newsConfigured(): boolean {
  return !!key();
}

export async function fetchLocalNews(
  city: string | null,
  region: string,
  max = 10,
): Promise<NewsArticle[]> {
  const k = key();
  if (!k) return [];

  // Scope to the user's area AND a civic/government topic set, matched only in
  // the title/description, so the rail reads as local policy news instead of
  // sports or generic coverage that merely mentions the city.
  const loc = city ? `("${city}" OR "${region}")` : `"${region}"`;
  const topic =
    `(housing OR policy OR legislation OR "city council" OR government OR ` +
    `election OR mayor OR law OR tax OR ordinance OR zoning OR budget OR ` +
    `homeless OR "ballot measure")`;
  const q = `${loc} AND ${topic}`;
  const url =
    `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}` +
    `&country=us&lang=en&in=title,description&max=${max}&expand=content&token=${k}`;

  let data: { articles?: Array<Record<string, unknown>> } | null = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  // GNews often returns the same wire story syndicated across outlets; dedupe
  // by normalized title so the rail shows distinct stories.
  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  for (const a of data?.articles ?? []) {
    const title = String(a.title ?? "").trim();
    const dedupeKey = title.toLowerCase();
    if (!title || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const src = (a.source as Record<string, unknown>) ?? {};
    out.push({
      id: `news-${out.length}-${String(a.publishedAt ?? "")}`,
      title,
      description: a.description ? String(a.description) : undefined,
      source: src.name ? String(src.name) : "News",
      url: String(a.url ?? ""),
      imageUrl: a.image ? String(a.image) : undefined,
      publishedAt: String(a.publishedAt ?? new Date().toISOString()),
    });
  }
  return out;
}
