// One-off screenshot capture for the PolicyPulse presentation doc.
// Drives the locally-installed Chrome via playwright-core, sets a fake
// geolocation (Oakland) so the Pulse Map locates, and triggers the live
// simulator + Ghost Protocol runs. Saves PNGs to docs/presentation/assets.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3003";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../docs/presentation/assets");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForText(page, text, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const found = await page.evaluate(
        (t) => document.body && document.body.innerText.includes(t),
        text,
      );
      if (found) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

async function shoot(page, name, fullPage = false) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage });
  console.log("  saved", name, fullPage ? "(full)" : "");
}

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
      "--hide-scrollbars",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    geolocation: { latitude: 37.8044, longitude: -122.2712 }, // Oakland, CA
    permissions: ["geolocation"],
    locale: "en-US",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  // 1) Homepage — Pulse Map, located in Oakland.
  try {
    console.log("Homepage / Pulse Map");
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await sleep(9000); // map tiles + bills + news
    await shoot(page, "01-homepage-pulsemap.png");
  } catch (e) { console.log("  ! homepage", e.message); }

  // 2) Simulator — idle hero.
  try {
    console.log("Simulator idle");
    await page.goto(BASE + "/simulate", { waitUntil: "domcontentloaded" });
    await sleep(3500);
    await shoot(page, "03-simulator-idle.png", true);
  } catch (e) { console.log("  ! sim idle", e.message); }

  // 3) Simulator — live/auto run from a real bill bridge.
  try {
    console.log("Simulator run (auto)");
    const qs = new URLSearchParams({
      policy:
        "Cap annual rent increases for existing tenants at 3% per year across all rental units in the city, with just-cause eviction protections.",
      jurisdiction: "Oakland, CA",
      state: "CA",
      label: "Oakland, CA",
    });
    await page.goto(BASE + "/simulate?" + qs.toString(), { waitUntil: "domcontentloaded" });
    // Let it analyze, ingest, spawn, simulate, finalize.
    const done = await waitForText(page, "Click any resident", 120000);
    console.log("  complete:", done);
    await sleep(2500);
    await shoot(page, "04-simulator-run.png", true);
  } catch (e) { console.log("  ! sim run", e.message); }

  // 4) Ghost Protocol — idle console (sponsor stack visible).
  try {
    console.log("Ghost idle");
    await page.goto(BASE + "/ghost", { waitUntil: "domcontentloaded" });
    await sleep(3500);
    await shoot(page, "05-ghost-idle.png", true);
  } catch (e) { console.log("  ! ghost idle", e.message); }

  // 5) Ghost Protocol — live cockpit + post-mortem.
  try {
    console.log("Ghost deploy");
    const btn = page.getByRole("button", { name: /deploy agents/i });
    await btn.click();
    // World designed by Claude + grounding; wait for nodes/cockpit.
    await waitForText(page, "nodes", 45000);
    await sleep(9000); // let a few ticks of negotiation render
    await shoot(page, "06-ghost-cockpit.png", true);
    // Wait for resolution + post-mortem.
    const resolved = await waitForText(page, "post-mortem", 90000)
      || await waitForText(page, "Critical decision", 5000)
      || await waitForText(page, "Resolved", 5000);
    console.log("  resolved:", resolved);
    await sleep(3000);
    await shoot(page, "07-ghost-postmortem.png", true);
  } catch (e) { console.log("  ! ghost run", e.message); }

  // 6) Lab.
  try {
    console.log("Lab");
    await page.goto(BASE + "/lab", { waitUntil: "domcontentloaded" });
    await sleep(3500);
    await shoot(page, "08-lab.png", true);
  } catch (e) { console.log("  ! lab", e.message); }

  // 7) Validate.
  try {
    console.log("Validate");
    await page.goto(BASE + "/validate", { waitUntil: "domcontentloaded" });
    await sleep(4000);
    await shoot(page, "09-validate.png", true);
  } catch (e) { console.log("  ! validate", e.message); }

  // 8) Runs.
  try {
    console.log("Runs");
    await page.goto(BASE + "/runs", { waitUntil: "domcontentloaded" });
    await sleep(3500);
    await shoot(page, "10-runs.png", true);
  } catch (e) { console.log("  ! runs", e.message); }

  await browser.close();
  console.log("DONE");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
