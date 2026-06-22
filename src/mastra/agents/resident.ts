import {Agent} from "@mastra/core/agent";
import {asiConfigured, callASI} from "@/lib/asi";
import {roleLabel} from "@/lib/engine";
import {templateNarrative} from "@/lib/narrative";
import type {AgentRecord, PolicyModel} from "@/lib/types";
import {fmtPct, fmtUSD} from "@/lib/utils";

// Resident's system prompt. Kept verbatim and shared by the Mastra Agent
// (registered for parity) and the ASI-1 transport that actually runs it.
const INSTRUCTIONS = `You role-play ONE specific synthetic resident living through a policy change.

You will be given a factual brief: who they are, their finances, and what happened to them at Month 1, Month 6, Year 1, and Year 3.

Write their story in FIRST PERSON, present-to-past tense, 90-150 words. Be grounded and specific: reference concrete numbers from the brief (rent, income, rent burden), their neighborhood, and the actual events that befell them. No melodrama, no policy advocacy, no statistics lecture — just one human voice describing how this policy reshaped their life. Do not invent facts beyond the brief.`;

export const residentAgent = new Agent({
  id: "resident",
  name: "Resident",
  instructions: INSTRUCTIONS,
  model: process.env.POLICYPULSE_ASI_MODEL || "asi1-mini",
});

function buildBrief(record: AgentRecord, model: PolicyModel): string {
  const p = record.persona;
  const lines: string[] = [];
  lines.push(`POLICY: ${model.title} — ${model.summary}`);
  lines.push(
    `RESIDENT: ${p.name}, age ${p.age}, ${roleLabel(p.roles)}, ${p.nativity}, household of ${p.householdSize}, ${p.tenure} in ${p.neighborhood}, works in ${p.sector}.`,
  );
  lines.push("TRAJECTORY:");
  for (const h of record.history) {
    const s = h.state;
    lines.push(
      `- ${h.label}: income ${fmtUSD(s.income)}, housing ${fmtUSD(s.monthlyHousingCost)}/mo (rent burden ${fmtPct(s.rentBurden)}), ${s.employed ? "employed" : "not employed"}${s.displaced ? ", DISPLACED" : ""}${s.leftJurisdiction ? ", LEFT THE CITY" : ""}. ${h.note}`,
    );
  }
  lines.push(`OUTCOME: ${record.outcome} (net welfare impact ${record.impactScore}).`);
  return lines.join("\n");
}

export async function narrateResident(
  record: AgentRecord,
  model: PolicyModel,
): Promise<{story: string; source: "llm" | "template"}> {
  if (!asiConfigured()) {
    return {story: templateNarrative(record, model), source: "template"};
  }
  try {
    const res = await callASI(INSTRUCTIONS, buildBrief(record, model), {maxTokens: 400, temperature: 0.8});
    const text = res?.text?.trim();
    if (text && text.length > 40) return {story: text, source: "llm"};
  } catch {
    /* fall through to template */
  }
  return {story: templateNarrative(record, model), source: "template"};
}
