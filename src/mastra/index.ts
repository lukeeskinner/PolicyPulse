import { Mastra } from "@mastra/core/mastra";
import { policyAnalystAgent } from "./agents/policy-analyst";
import { residentAgent } from "./agents/resident";
import { ghostReasoningAgent } from "./agents/ghost";
import { ingestJurisdictionTool } from "./tools/ingest-jurisdiction";
import { simulationWorkflow } from "./workflows/simulation";

// The Mastra instance: policy analysis + resident narration for PolicyPulse,
// the Ghost Protocol crisis-reasoning agent, the jurisdiction ingestion tool,
// and the simulation workflow.
export const mastra = new Mastra({
  agents: {
    policyAnalyst: policyAnalystAgent,
    resident: residentAgent,
    ghostReasoner: ghostReasoningAgent,
  },
  workflows: {
    simulation: simulationWorkflow,
  },
  tools: {
    ingestJurisdiction: ingestJurisdictionTool,
  },
});
