import { NextResponse, type NextRequest } from "next/server";
import { cached, cacheKey } from "@/lib/cache";
import { fetchLocalNews, newsConfigured } from "@/lib/sources/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real local news for ?region=California (&city=Oakland) via GNews.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const city = sp.get("city");
  const region = sp.get("region") || "";

  if (!newsConfigured()) {
    return NextResponse.json({ articles: [], status: "missing_key" });
  }
  if (!region.trim()) {
    return NextResponse.json({ articles: [], status: "empty" });
  }

  try {
    const articles = await cached(
      cacheKey("news", (city || "").toLowerCase(), region.toLowerCase()),
      20 * 60 * 1000,
      () => fetchLocalNews(city, region),
    );
    return NextResponse.json({ articles, status: articles.length ? "live" : "empty" });
  } catch {
    return NextResponse.json({ articles: [], status: "error" });
  }
}
