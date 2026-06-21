# PolicyPulse

**A demographic digital twin of America. Type in a policy — watch the inequality it creates emerge, resident by resident.**

Every policy creates winners and losers, but we usually only find out who *after* it passes. PolicyPulse builds a statistically representative population of AI residents for a real U.S. city, then makes each one live through your policy across three years. Second-order effects cascade (a landlord sells → tenants get displaced; a wage floor rises → a small business cuts hours), and an inequality spotlight reveals exactly **who gets hurt** — before anyone votes.

---

## What it does

1. **Paste a bill or pick a preset**, choose a city, and set how many residents to simulate.
2. **Ingestion** pulls a grounded demographic + housing profile of the community (Census/ACS/BLS-shaped), optionally verified with a live Browserbase session.
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
| Live ingestion | **Browserbase** — optional headless session to verify community data |
| Viz | Recharts, Framer Motion, Lucide |

**Graceful degradation is a feature:** with *no API keys at all*, the app still runs end-to-end — heuristic policy parsing, template resident stories, grounded datasets, and an in-memory event bus. Add keys to light up the live integrations.

## Getting started

```bash
npm install
npm run dev
```

Open the printed URL (e.g. http://localhost:3000). Click the **Oakland rent control** preset and hit **Run simulation**.

### Optional environment variables

Copy `.env.example` to `.env.local` and add what you have — all are optional:

- `ANTHROPIC_API_KEY` — enables the Mastra Haiku agents (policy analysis + resident stories).
- `REDIS_URL` — mirrors every run into Redis Stack (Streams/JSON/TimeSeries/Pub-Sub).
- `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` + `ENABLE_BROWSERBASE=1` — live ingestion (also `npm i playwright-core`).

## Architecture

```
src/
  app/
    page.tsx                 Live dashboard (client)
    validate/page.tsx        Historical validation
    api/
      simulate/              POST: start a run
      stream/[runId]/        SSE: live event stream (backlog replay + live tail)
      run/[runId]/           Full run snapshot
      agent/[runId]/[id]/    Resident narrative (Haiku) + trajectory
      runs/ · health/ · validate/
  lib/
    engine.ts                Simulation engine (rounds, cascades, second-order effects)
    metrics.ts               Aggregation + inequality analysis (disparities, segments, Gini)
    personas.ts              Proportional agent spawning
    demographics.ts          Grounded Census/ACS/BLS-shaped datasets
    policy.ts                Heuristic policy parser (offline brain)
    orchestrator.ts          Paced live run driver -> bus events
    bus.ts · runStore.ts · redis.ts   The "nervous system"
    ingest.ts                Jurisdiction ingestion (+ optional Browserbase)
    historical.ts            Validation cases vs. published studies
    useSimulation.ts         Client hook (SSE consumption, rAF-batched)
  mastra/
    index.ts                 Mastra instance
    agents/                  policy-analyst, resident
    tools/                   ingest-jurisdiction
    workflows/               simulation
  components/                Dashboard UI
```

## A note on honesty

The demographic datasets are **directionally realistic but approximate**, drawn from the shape of public Census/ACS/BLS data and clearly labeled in the UI (`grounded data` vs `national avg`). The simulation engine is a transparent, parameterized model of well-studied policy dynamics (rent control, minimum wage, zoning, etc.) — not a forecast. Synthetic residents are illustrative, not representative of any real person. Historical figures on `/validate` are reference points for **directional** validation, summarized from the cited studies. PolicyPulse is a tool for building intuition about distributional effects, not a substitute for formal policy analysis.
