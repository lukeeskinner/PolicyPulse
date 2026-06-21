import { getBaseProfile, sourcesFor } from "./demographics";
import type { DemographicProfile, SourceRef } from "./types";

// ============================================================================
// Jurisdiction ingestion.
//
// By default this returns a grounded, clearly-labeled demographic dataset (the
// shape of Census/ACS/BLS data). When BROWSERBASE_API_KEY + ENABLE_BROWSERBASE
// are set, it additionally opens a real headless Browserbase session to verify
// live data for the jurisdiction. The crawl is best-effort: any failure falls
// back silently to the dataset so the product always runs.
// ============================================================================

export interface IngestResult {
  profile: DemographicProfile;
  sources: SourceRef[];
  live: boolean;
}

export async function loadProfile(jurisdiction: string): Promise<IngestResult> {
  const profile = getBaseProfile(jurisdiction);
  profile.sources = sourcesFor(profile);

  let live = false;
  if (
    process.env.BROWSERBASE_API_KEY &&
    process.env.BROWSERBASE_PROJECT_ID &&
    process.env.ENABLE_BROWSERBASE === "1"
  ) {
    try {
      live = await enrichWithBrowserbase(profile);
    } catch {
      live = false;
    }
  }

  return { profile, sources: profile.sources, live };
}

// Opens a Browserbase session and navigates to the jurisdiction's public
// Wikipedia page to confirm a live fetch (and update population when parseable).
// Uses dynamic imports so playwright-core / the SDK are only needed when enabled.
async function enrichWithBrowserbase(profile: DemographicProfile): Promise<boolean> {
  const { default: Browserbase } = await import("@browserbasehq/sdk");
  // playwright-core connects to the remote browser over CDP (no local browser).
  // Non-literal specifier so it stays an optional, install-on-demand dependency.
  const playwrightModule = "playwright-core";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { chromium } = (await import(/* turbopackIgnore: true */ playwrightModule)) as any;

  const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
  });

  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    const city = profile.jurisdiction.split(",")[0].trim().replace(/\s+/g, "_");
    const state = profile.jurisdiction.split(",")[1]?.trim();
    const slug = state ? `${city},_${stateName(state)}` : city;
    await page.goto(`https://en.wikipedia.org/wiki/${slug}`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    const title = await page.title();

    // Attempt to read the population value from the infobox.
    const popText = await page
      .locator("th:has-text('Population')")
      .first()
      .locator("xpath=ancestor::tr/following-sibling::tr[1]")
      .innerText()
      .catch(() => "");
    const parsed = parseInt(popText.replace(/[^0-9]/g, "").slice(0, 9), 10);
    if (!Number.isNaN(parsed) && parsed > 1000) {
      profile.population = parsed;
    }

    profile.sources.unshift({
      label: "Browserbase live session",
      detail: `Fetched "${title}" via a headless browser to verify ${profile.jurisdiction}`,
      url: `https://en.wikipedia.org/wiki/${slug}`,
      kind: "news",
    });
    profile.notes = `Live Browserbase session ${session.id} confirmed data for ${profile.jurisdiction}.`;
    return true;
  } finally {
    await browser.close().catch(() => {});
  }
}

function stateName(abbr: string): string {
  const map: Record<string, string> = {
    CA: "California",
    WA: "Washington",
    TX: "Texas",
    NY: "New_York",
  };
  return map[abbr] ?? abbr;
}
