import type { Advisory, Grounding } from "./types";

// ============================================================================
// Scenario grounding — REAL threat intelligence only.
//
// Opens a live Browserbase session and scrapes current CISA cybersecurity
// advisories matching terms from the crisis prompt. There is no seeded/canned
// data: if Browserbase isn't configured or the crawl returns nothing, grounding
// is simply empty (an honest "no live advisories") and the world is designed
// from the prompt alone.
// ============================================================================

function browserbaseEnabled(): boolean {
  return !!(
    process.env.BROWSERBASE_API_KEY &&
    process.env.BROWSERBASE_PROJECT_ID &&
    process.env.ENABLE_BROWSERBASE === "1"
  );
}

const THREAT_TERMS = [
  "ransomware", "lockbit", "ddos", "phishing", "malware", "scada", "plc",
  "water", "power grid", "grid", "substation", "hospital", "healthcare",
  "lidar", "sensor", "ics", "ot", "industrial control",
];

function searchTerm(prompt: string): string {
  const p = prompt.toLowerCase();
  const hit = THREAT_TERMS.find((t) => p.includes(t));
  return hit ?? "industrial control systems";
}

export async function groundScenario(prompt: string): Promise<Grounding> {
  if (!browserbaseEnabled()) {
    return { source: "none", advisories: [], notes: "Browserbase not configured — world designed from the prompt alone." };
  }
  try {
    return await crawlCisa(prompt);
  } catch {
    return { source: "none", advisories: [], notes: "Live advisory crawl failed — world designed from the prompt alone." };
  }
}

async function crawlCisa(prompt: string): Promise<Grounding> {
  const { default: Browserbase } = await import("@browserbasehq/sdk");
  const playwrightModule = "playwright-core";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { chromium } = (await import(/* turbopackIgnore: true */ playwrightModule)) as any;

  const term = searchTerm(prompt);
  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  const session = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID! });
  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    const url = `https://www.cisa.gov/news-events/cybersecurity-advisories?search_api_fulltext=${encodeURIComponent(term)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });

    // Scrape the real advisory result links/titles.
    const results: { title: string; href: string }[] = await page.$$eval(
      "h3.c-teaser__title a, article a, main a[href*='/news-events/']",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (els: any[]) =>
        els
          .map((e) => ({ title: (e.textContent || "").trim(), href: (e as HTMLAnchorElement).href }))
          .filter((r) => r.title.length > 20 && /\/news-events\//.test(r.href))
          .slice(0, 4),
    ).catch(() => [] as { title: string; href: string }[]);

    const advisories: Advisory[] = results.map((r, i) => ({
      id: `CISA-LIVE-${i + 1}`,
      title: r.title.slice(0, 160),
      detail: `Live CISA cybersecurity advisory retrieved for "${term}".`,
      url: r.href,
    }));

    return {
      source: "browserbase",
      advisories,
      notes: `Browserbase session ${session.id} searched CISA advisories for "${term}" and returned ${advisories.length} live result(s).`,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
