import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { loadProfile } from "@/lib/ingest";

// Mastra tool wrapping jurisdiction ingestion. Returns a grounded demographic
// profile (and opens a live Browserbase session when enabled). Surfaced in
// Mastra Studio and usable by agents.
export const ingestJurisdictionTool = createTool({
  id: "ingest-jurisdiction",
  description:
    "Ingest the demographic and housing profile of a U.S. jurisdiction (population, race/ethnicity, income and tenure by group, neighborhoods, employment sectors) from grounded Census/ACS/BLS-shaped data, optionally verified with a live Browserbase session.",
  inputSchema: z.object({
    jurisdiction: z.string().describe("City and state, e.g. 'Oakland, CA'"),
    policyType: z.string().optional().describe("Optional policy category for context"),
  }),
  outputSchema: z.object({
    live: z.boolean(),
    profile: z.any(),
    sources: z.array(z.any()),
  }),
  execute: async (inputData) => {
    const { jurisdiction } = inputData as { jurisdiction: string };
    const result = await loadProfile(jurisdiction);
    return { live: result.live, profile: result.profile, sources: result.sources };
  },
});
