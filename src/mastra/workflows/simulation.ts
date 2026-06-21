import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { SimulationEngine } from "@/lib/engine";
import { loadProfile } from "@/lib/ingest";
import { analyze, computeRoundMetrics } from "@/lib/metrics";
import { spawnPersonas } from "@/lib/personas";
import { ROUNDS, type DemographicProfile, type PolicyModel } from "@/lib/types";
import { makeRng } from "@/lib/utils";
import { runPolicyAnalysis } from "../agents/policy-analyst";

// A Mastra workflow version of the pipeline (ingest+analyze -> simulate+report).
// The live dashboard uses the streaming orchestrator instead, but this exposes
// the same logic as a runnable, inspectable workflow in Mastra Studio.

const inputSchema = z.object({
  policy: z.string().describe("Free-text policy or bill"),
  jurisdiction: z.string().describe("City, state — e.g. 'Oakland, CA'"),
  agentCount: z.number().default(50),
});

const midSchema = z.object({
  policy: z.string(),
  jurisdiction: z.string(),
  agentCount: z.number(),
  profile: z.any(),
  model: z.any(),
});

const reportSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  metricsByRound: z.any(),
  analysis: z.any(),
});

const ingestAndAnalyze = createStep({
  id: "ingest-and-analyze",
  inputSchema,
  outputSchema: midSchema,
  execute: async ({ inputData }) => {
    const { policy, jurisdiction, agentCount } = inputData;
    const { profile } = await loadProfile(jurisdiction);
    const model = await runPolicyAnalysis(policy, jurisdiction);
    return { policy, jurisdiction, agentCount, profile, model };
  },
});

const simulateAndReport = createStep({
  id: "simulate-and-report",
  inputSchema: midSchema,
  outputSchema: reportSchema,
  execute: async ({ inputData }) => {
    const { policy, jurisdiction, agentCount } = inputData;
    const profile = inputData.profile as DemographicProfile;
    const model = inputData.model as PolicyModel;
    const rng = makeRng(`${jurisdiction}:${policy}`);
    const { personas } = spawnPersonas(profile, agentCount, rng);
    const engine = new SimulationEngine(profile, model, personas, rng);
    const baselineAvgBurden =
      engine.agents.reduce((s, a) => s + a.history[0].state.rentBurden, 0) /
      Math.max(engine.agents.length, 1);
    const metricsByRound = [];
    for (const r of ROUNDS) {
      engine.step(r);
      metricsByRound.push(
        computeRoundMetrics(engine.agents, profile, r, engine.supplyIndex, baselineAvgBurden),
      );
    }
    engine.finalize();
    const analysis = analyze(engine.agents, profile, model, engine.supplyIndex);
    return {
      headline: analysis.headline,
      summary: analysis.summary,
      metricsByRound,
      analysis,
    };
  },
});

export const simulationWorkflow = createWorkflow({
  id: "simulation",
  inputSchema,
  outputSchema: reportSchema,
})
  .then(ingestAndAnalyze)
  .then(simulateAndReport)
  .commit();
