import { Mastra } from "@mastra/core/mastra";
import { policyAnalystAgent } from "./agents/policy-analyst";
import { residentAgent } from "./agents/resident";
import { ingestJurisdictionTool } from "./tools/ingest-jurisdiction";
import { simulationWorkflow } from "./workflows/simulation";

// The Mastra instance: two agents (policy analysis + resident narration), the
// jurisdiction ingestion tool, and the simulation workflow.
export const mastra = new Mastra({
  agents: {
    policyAnalyst: policyAnalystAgent,
    resident: residentAgent,
  },
  workflows: {
    simulation: simulationWorkflow,
  },
  tools: {
    ingestJurisdiction: ingestJurisdictionTool,
  },
});
