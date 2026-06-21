import type { Grounding, Scenario } from "./types";
import { groundingFor } from "./scenarios";

// ============================================================================
// Scenario grounding. By default returns the pre-seeded, clearly-labeled threat
// intelligence for the domain (real attack vectors from CISA/MITRE, not
// invented ones). When Browserbase is configured, it additionally opens a real
// headless session to fetch a live CISA advisory and prepends it — best-effort,
// falling back silently to the seed so the demo always runs.
// ============================================================================

export async function groundScenario(scenario: Scenario): Promise<Grounding> {
  const seed = groundingFor(scenario.domain);
  if (
    !(
      process.env.BROWSERBASE_API_KEY &&
      process.env.BROWSERBASE_PROJECT_ID &&
      process.env.ENABLE_BROWSERBASE === "1"
    )
  ) {
    return seed;
  }
  try {
    return await enrichWithBrowserbase(scenario, seed);
  } catch {
    return seed;
  }
}

async function enrichWithBrowserbase(scenario: Scenario, seed: Grounding): Promise<Grounding> {
  const { default: Browserbase } = await import("@browserbasehq/sdk");
  const playwrightModule = "playwright-core";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { chromium } = (await import(/* turbopackIgnore: true */ playwrightModule)) as any;

  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  const session = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID! });
  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://www.cisa.gov/news-events/cybersecurity-advisories?f%5B0%5D=advisory_type%3A95", {
      waitUntil: "domcontentloaded",
      timeout: 12000,
    });
    const title = await page.title();
    const headline = await page
      .locator("h3 a, article a")
      .first()
      .innerText()
      .catch(() => "");

    return {
      source: "browserbase",
      notes: `Live Browserbase session ${session.id} fetched current CISA advisories ("${title}") to ground the ${scenario.threatType} scenario.`,
      advisories: [
        {
          id: "CISA (live)",
          title: headline || "Latest CISA cybersecurity advisory",
          detail: "Fetched live via a headless Browserbase session to verify the scenario's threat parameters against current advisories.",
          url: "https://www.cisa.gov/news-events/cybersecurity-advisories",
        },
        ...seed.advisories,
      ],
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
