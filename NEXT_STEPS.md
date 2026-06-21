# PolicyPulse — Next Steps

Quick working list. Checkboxes are unstarted unless noted. File paths are relative to repo root.

---

## 1. Fix location (geolocation not working)

**Where it lives:** `src/lib/usePulse.ts` (`locate` / `search`), `src/app/api/geo/route.ts`, `src/lib/sources/geocode.ts`.

**Most likely root cause:** browser geolocation only works in a **secure context**. `next dev` prints a LAN URL (e.g. `http://10.59.126.49:3000`) and `navigator.geolocation` is **blocked on insecure origins**. On that URL "Use my location" silently fails into the manual prompt — which can look like "location is broken."

- [ ] Test on `http://localhost:3000` (secure) — not the LAN IP. If it works there, that was it.
- [ ] Open the console and log the geolocation error in the failure callback (`src/lib/usePulse.ts` ~line 113) — distinguish denied vs. timeout vs. unavailable.
- [ ] Verify the Mapbox path independently: hit `/api/geo?q=Oakland` and `/api/geo?lat=37.8&lng=-122.27` — both should return an `area` with a 2-letter `regionCode`.
- [ ] "Locates but no bills/news" bug: everything downstream keys off `area.regionCode` (a US state abbr). `reverseGeocode` requests `types=place,region`; if Mapbox returns no region, `featureToArea` returns `null`. Confirm the `/api/geo` response actually contains `regionCode`.

**Quick wins while in here:**
- [ ] Make the ZIP/city **search** the primary affordance (it uses `forwardGeocode` and works regardless of browser geo).
- [ ] Show a real error message ("Location blocked — search instead") instead of just reopening the prompt.
- [ ] Consider an IP-based fallback when geolocation is denied/unavailable.

---

## 2. New feature: "Email your representative"

**Why it fits:** PolicyPulse already calls itself a *civic-participation tool*. The natural payoff after "here's who this bill hurts" is "do something about it." This closes the loop: see bill → simulate impact → contact your rep.

**Suggested flow:**
- [ ] **Rep lookup** by the user's area. Options (pick one):
  - Federal members: `CONGRESS_API_KEY` (already configured) — members by state.
  - State legislators + by-location: `OPENSTATES_API_KEY` (already configured) has a people/geo endpoint.
  - Governor / all levels by address: Google Civic Info or Cicero (note: verify current API availability before committing — Google deprecated parts of its representatives endpoint).
- [ ] **Draft the email** with the existing LLM pattern: add a new `src/mastra/agents/advocate.ts` (mirrors `policy-analyst.ts`) that writes a short, respectful, first-person constituent email citing the bill identifier + the run's `whoGetsHurt` / `winners` findings for that area. Keep a non-LLM **template fallback** (matches the app's graceful-degradation style).
- [ ] **Delivery:** prefilled `mailto:` (to / subject / body) + copy-to-clipboard. Many legislators only accept webforms — link to their contact page when there's no email.
- [ ] **UI placement:** a CTA on the bill detail (`src/components/PolicyDetail.tsx`) and/or right after the `InequalitySpotlight` (the most persuasive moment).

**New files (rough):** `src/lib/sources/representatives.ts`, `src/app/api/representatives/route.ts`, `src/mastra/agents/advocate.ts` (+ a Zod schema in `src/lib/schemas.ts`), `src/components/ContactRep.tsx`. Add a rep-API env var if needed.

---

## 3. Remove validation

**What it currently does (so the call is informed):** `/validate` runs real, studied historical policies (SF 1994 rent control, Seattle $15 min wage, Minneapolis 2040 upzoning) through the *same* engine and compares the predicted **direction** of effects against documented study findings. It's the "does the model get reality right?" credibility/trust surface.

**To remove cleanly:**
- [ ] Delete `src/app/validate/page.tsx`
- [ ] Delete `src/app/api/validate/route.ts`
- [ ] Delete `src/lib/historical.ts` (only used by validation)
- [ ] In `src/app/simulate/page.tsx`: remove the "Validation" nav link (~lines 80–85) and drop the now-unused `FlaskConical` import.
- [ ] Re-run `npm run lint && npm run build` to confirm no dangling imports.

> Heads-up: this is the main thing answering "is this just made-up numbers?" If you remove it, consider keeping a lighter substitute (see Devin idea #6).

---

## 4. Fix graphs — *(owned by you)*

**Where:** `src/components/MetricsTimeline.tsx` (Recharts `LineChart`).
Leaving this to you — flagging likely "fix" targets in case useful: axis/legend clarity, the single-point empty state, tooltip formatting, and responsive height on mobile. Colors already moved onto the new palette (wellbeing = signal blue; burden/displacement keep semantic rose/amber).

---

## Devin's ideas (my own — not from your list)

1. **Shareable, reproducible run links + OG image.** Runs are deterministic from a seed (`makeRng(\`${jurisdiction}:${policy}:${agentCount}\`)`), so a `/simulate?...` URL reproduces the exact run. Add a share button + a dynamic OG image of the headline/Gini. Strong fit for a civic tool meant to spread.
2. **Uncertainty band.** Run the sim across N seeds and show a range (e.g. "displacement 6–11%") instead of one number. Directly answers the "is this just made up?" worry and reads as a real model with variance.
3. **Compare two policies side-by-side** (or policy vs. status quo) on the same population.
4. **Recolor the demographic groups.** They currently reuse the outcome palette (amber/rose/emerald), which can read as "good/bad" rather than identity. Give groups their own distinct hue family (`src/lib/ui.ts` `GROUP_COLORS`).
5. **Run history gallery.** `REDIS_URL` and `/api/runs` already exist — add a "recent runs" view so sessions persist and are browsable.
6. **Replace `/validate` with a short "How this works / Methodology" page.** Keeps the credibility story (model is transparent + directionally validated) without maintaining the comparison engine — pairs well with removing validation.
7. **Mobile + a11y polish pass.** Reduced-motion is already handled in the redesign; finish keyboard/focus order and small-screen layouts.
