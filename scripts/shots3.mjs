// Capture the Stakeholder Council surface: idle, live cockpit, and verdict.
// The council completes even without Claude (deterministic grounded fallback).
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
      const f = await page.evaluate((t) => document.body?.innerText.includes(t), text);
      if (f) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--hide-scrollbars"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, colorScheme: "dark" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  try {
    console.log("Council idle");
    await page.goto(BASE + "/council", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(4000);
    await page.screenshot({ path: path.join(OUT, "11-council-idle.png"), fullPage: true, timeout: 60000 });
    console.log("  saved 11-council-idle.png");
  } catch (e) { console.log("  ! council idle", e.message); }

  try {
    console.log("Council convene");
    await page.getByRole("button", { name: /convene the council/i }).click();
    // debate populates after grounding (a sim run) + seating
    await waitForText(page, "Debate", 40000);
    await sleep(14000); // let several rounds of debate + amendment render
    await page.screenshot({ path: path.join(OUT, "12-council-cockpit.png"), fullPage: true, timeout: 60000 });
    console.log("  saved 12-council-cockpit.png");
    // verdict after the re-test + vote
    const done = await waitForText(page, "Ratified", 90000) || await waitForText(page, "aye", 5000);
    console.log("  ratified:", done);
    await sleep(4000);
    await page.screenshot({ path: path.join(OUT, "13-council-verdict.png"), fullPage: true, timeout: 60000 });
    console.log("  saved 13-council-verdict.png");
  } catch (e) { console.log("  ! council run", e.message); }

  await browser.close();
  console.log("DONE");
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
