// Re-capture the two shots that failed in the first pass:
//  - homepage Pulse Map (WebGL: needs a longer screenshot timeout, lower DPR)
//  - simulator idle hero (failed only due to dev first-compile latency)
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3003";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../docs/presentation/assets");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // Simulator idle (DPR 2, routes now warm).
  try {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, colorScheme: "dark" });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);
    console.log("Simulator idle");
    await page.goto(BASE + "/simulate", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(4000);
    await page.screenshot({ path: path.join(OUT, "03-simulator-idle.png"), fullPage: true, timeout: 60000 });
    console.log("  saved 03-simulator-idle.png");
    await ctx.close();
  } catch (e) { console.log("  ! sim idle", e.message); }

  // Homepage Pulse Map (DPR 1 to lighten the WebGL compositor, generous timeout).
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 1,
      geolocation: { latitude: 37.8044, longitude: -122.2712 },
      permissions: ["geolocation"],
      locale: "en-US",
      colorScheme: "dark",
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(90000);
    console.log("Homepage Pulse Map");
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(16000); // map fly-to + tiles + bills + news settle
    await page.screenshot({ path: path.join(OUT, "01-homepage-pulsemap.png"), timeout: 90000 });
    console.log("  saved 01-homepage-pulsemap.png");
    await ctx.close();
  } catch (e) { console.log("  ! homepage", e.message); }

  await browser.close();
  console.log("DONE");
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
