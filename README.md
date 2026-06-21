# PolicyPulse

**See the law moving around you — then stress-test it on a digital twin of your own community.**

PolicyPulse has two halves that flow into each other:

1. **The Pulse Map** (homepage) — a live, tilted 3D map of the United States that finds your area and surfaces the *real* federal and state bills moving around you right now, alongside a rail of local policy news. No mock data: every marker is a real bill from Congress.gov / OpenStates, every story is real local news.
2. **The Simulator** (`/simulate`) — click any bill (or paste your own) and watch it play out across a statistically representative population of AI residents **built from live U.S. Census (ACS) data** for that state. Residents live through three years; second-order effects cascade (a landlord sells → tenants get displaced; a wage floor rises → a small business cuts hours), and an inequality spotlight reveals exactly **who gets hurt** — before anyone votes.

---

## What it does

### The Pulse Map (homepage)

- **Finds your area** from the browser's geolocation (or a ZIP / city search), reverse-geocoded with Mapbox.
- **Pulls the real bills around you** — live federal legislation from the Congress.gov API and state legislation from OpenStates — and plots them as glowing markers on a 3D map that flies to your state.
- **Streams local policy news** for your area from GNews in an auto-scrolling rail.
- Click a marker to read the bill, then **“Simulate this policy”** hands it off to the simulator.

### The Simulator (`/simulate`)

1. **A bill arrives from the map** (or you paste your own and pick a state).
2. **Ingestion** grounds the population in **live U.S. Census ACS data** for that state — real population, median income, rent, racial composition, income distribution, tenure, and industry mix. Without a Census key it falls back to grounded, clearly-labeled datasets.
3. A **Mastra PolicyAnalyst agent** parses the free-text bill into a structured *impact model* (mechanism, intensity, who benefits, who pays, likely unintended consequences).
4. **Proportional spawning** creates individual residents whose joint distribution of race × neighborhood × income × tenure × employment matches the real community.
5. Residents **live through Month 1 → Year 3**. Each round layers market drift, direct policy effects, and **cascading shocks** between agents — streamed live to the dashboard.
6. The **Inequality Spotlight** quantifies disparities (e.g., displacement by race), the Gini shift, materialized unintended consequences, and ranked *who-gets-hurt / who-benefits* segments.
7. Click any resident to read their **AI-generated first-person story** (a Mastra Resident agent on Claude Haiku).

There's also a **/validate** page that runs real, studied policies (e.g., SF's 1994 rent-control expansion) through the same engine and compares the predicted *direction* of effects against the documented findings of published research.

## Tech & sponsor integrations

| Layer | Tech |
| --- | --- |
| Framework | **Next.js 16** (App Router, RSC, SSE streaming), React 19, TypeScript, Tailwind v4 |
| Agents & orchestration | **Mastra** — `PolicyAnalyst` + `Resident` agents, a jurisdiction-ingestion tool, and a 2-step simulation workflow |
| LLM | **Anthropic Claude Haiku** via Mastra's model router |
| Nervous system | **Redis** — Streams (event log), JSON (snapshots), TimeSeries (metric trends), Pub/Sub |
| Live civic data | **U.S. Census ACS** (population), **Congress.gov** (federal bills), **OpenStates** (state bills), **GNews** (local news), **Mapbox** (3D map + geocoding) |
| Live ingestion | **Browserbase** — optional headless session to verify community data |
| Viz | **Mapbox GL + deck.gl** (3D map), Recharts, Framer Motion, Lucide |

**Graceful degradation is a feature:** with *no API keys at all*, the app still runs end-to-end — heuristic policy parsing, template resident stories, grounded datasets, and an in-memory event bus. Each live surface degrades to an **honest empty state** (“connect this key” / “no results”) rather than ever inventing data: no Mapbox token shows a connect-token prompt, no Census key falls back to labeled datasets, and no Congress / OpenStates / GNews key shows an empty rail. Add keys to light up the live integrations.

## Getting started

```bash
npm install
npm run dev
```

Open the printed URL (e.g. http://localhost:3000). With no keys you'll get the Pulse Map's “connect Mapbox” prompt and the `/simulate` dashboard running on labeled datasets — fully functional. Add keys (below) to go fully live, then restart `npm run dev` (env vars load on boot).

### Environment variables

Copy `.env.example` to `.env.local` and add what you have — **everything is optional** and each key lights up one surface:

**Live Pulse Map + Census-grounded population:**

- `NEXT_PUBLIC_MAPBOX_TOKEN` — renders the 3D map and powers geolocation / search ([account.mapbox.com](https://account.mapbox.com/access-tokens/)).
- `CENSUS_API_KEY` — grounds the simulated population in real ACS data ([api.census.gov](https://api.census.gov/data/key_signup.html)).
- `CONGRESS_API_KEY` — real federal bills ([api.congress.gov](https://api.congress.gov/sign-up/)).
- `OPENSTATES_API_KEY` — real state-legislature bills ([open.pluralpolicy.com](https://open.pluralpolicy.com/accounts/profile/)).
- `GNEWS_API_KEY` — real local policy news ([gnews.io](https://gnews.io/)).

**Simulator agents + nervous system:**

- `ANTHROPIC_API_KEY` — enables the Mastra Haiku agents (policy analysis + resident stories).
- `REDIS_URL` — mirrors every run into Redis Stack (Streams/JSON/TimeSeries/Pub-Sub).
- `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` + `ENABLE_BROWSERBASE=1` — optional live ingestion (also `npm i playwright-core`).

## Architecture

```
src/
  app/
    page.tsx                 Pulse Map landing (live bills near you, client)
    simulate/page.tsx        The simulator dashboard (client)
    validate/page.tsx        Historical validation
    api/
      geo/                   Reverse/forward geocoding (Mapbox)
      policies/              Real federal (Congress.gov) + state (OpenStates) bills
      news/                  Real local policy news (GNews)
      census/                Live ACS demographic profile for a state
      simulate/              POST: start a run
      stream/[runId]/        SSE: live event stream (backlog replay + live tail)
      run/[runId]/           Full run snapshot
      agent/[runId]/[id]/    Resident narrative (Haiku) + trajectory
      runs/ · health/ · validate/
  lib/
    civic.ts                 Pulse Map types + geometry (markers, arcs)
    usePulse.ts              Homepage hook (locate -> fetch bills/news/census)
    states.ts                US state metadata (FIPS, centroids)
    cache.ts                 TTL cache for live API calls (quota-friendly)
    sources/                 census · congress · openstates · news · geocode
    engine.ts                Simulation engine (rounds, cascades, second-order effects)
    metrics.ts               Aggregation + inequality analysis (disparities, segments, Gini)
    personas.ts              Proportional agent spawning
    demographics.ts          Grounded Census/ACS/BLS-shaped fallback datasets
    policy.ts                Heuristic policy parser (offline brain)
    orchestrator.ts          Paced live run driver -> bus events
    bus.ts · runStore.ts · redis.ts   The "nervous system"
    ingest.ts                Jurisdiction ingestion (live Census, + optional Browserbase)
    historical.ts            Validation cases vs. published studies
    useSimulation.ts         Simulator client hook (SSE consumption, rAF-batched)
  mastra/
    index.ts                 Mastra instance
    agents/                  policy-analyst, resident
    tools/                   ingest-jurisdiction
    workflows/               simulation
  components/                Pulse Map (PulseMap, NewsRail, PolicyDetail, LocationBadge) + dashboard UI
```

## A note on honesty

The bills on the Pulse Map are **real** (Congress.gov / OpenStates) and the news is **real** (GNews). The simulated population is **directionally realistic**: with a Census key it's built from **real ACS data** for the state; without one it falls back to approximate, clearly-labeled datasets drawn from the shape of public Census/ACS/BLS data (`grounded data` vs `national avg`). Two demographic fields (income-tier “neighborhoods” and per-group immigrant share) are transparently *derived* from the real ACS figures and labeled as such. The simulation engine itself is a transparent, parameterized model of well-studied policy dynamics (rent control, minimum wage, zoning, etc.) — not a forecast. Synthetic residents are illustrative, not representative of any real person. Historical figures on `/validate` are reference points for **directional** validation, summarized from the cited studies. PolicyPulse is a tool for building intuition about distributional effects, not a substitute for formal policy analysis.
