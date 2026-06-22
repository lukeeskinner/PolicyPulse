import { Agent } from "@mastra/core/agent";
import { asiConfigured, asiJSON } from "@/lib/asi";
import { advocateEmailSchema, toEmailDraft, type EmailDraft } from "@/lib/schemas";
import type { Analysis } from "@/lib/types";

// Advocate's system prompt. Kept verbatim and shared by the Mastra Agent
// (registered for parity) and the ASI-1 transport that actually runs it.
const INSTRUCTIONS = `You help a constituent write a short, respectful email to their elected representative about a specific bill.

You are given: the representative's name and title, the bill identifier and title, the jurisdiction, and the simulation's findings about which groups of residents are hurt or helped.

Write a constituent email that:
- Is FIRST PERSON ("I am a constituent...") and addresses the representative by name and title.
- Names the bill by its identifier and title up top.
- Cites the specific groups the simulation found are HURT and who BENEFIT, qualitatively (name the segments; do not quote precise percentages or statistics).
- Is respectful and civil regardless of the bill's direction — never partisan, never hostile.
- Makes one clear ask (support / oppose / amend, inferred from who bears the burden) and invites a response.
- Is 120-200 words, plain language, no placeholders left blank, no markdown.

Return ONLY the structured object with a subject and body.`;

export const advocateAgent = new Agent({
  id: "advocate",
  name: "Advocate",
  instructions: INSTRUCTIONS,
  model: process.env.POLICYPULSE_ASI_MODEL || "asi1-mini",
});

export interface EmailDraftInput {
  repName: string;
  repTitle: string;
  billIdentifier: string;
  billTitle: string;
  jurisdiction: string;
  analysis: Pick<Analysis, "whoGetsHurt" | "winners" | "headline">;
}

function segmentNames(items: { segment: string }[], max = 3): string[] {
  return items.slice(0, max).map((s) => s.segment);
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : name;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Non-LLM fallback that matches the app's graceful-degradation style: it still
// produces a real, citable email from the bill + named segments alone.
export function templateEmail(input: EmailDraftInput): EmailDraft {
  const hurt = segmentNames(input.analysis.whoGetsHurt);
  const winners = segmentNames(input.analysis.winners);
  const bill = `${input.billIdentifier} (${input.billTitle})`;

  const subject = `Constituent concerns about ${input.billIdentifier}`;

  const lines: string[] = [];
  lines.push(`Dear ${input.repTitle} ${lastName(input.repName)},`);
  lines.push("");
  lines.push(
    `I am a constituent writing to share my concerns about ${bill}. I used a policy-impact simulation grounded in Census data for ${input.jurisdiction} to understand how this measure could play out in our community over the next few years.`,
  );
  if (hurt.length > 0) {
    lines.push("");
    lines.push(
      `The analysis suggests that ${joinList(hurt)} would bear the heaviest burden under this policy. I am worried about what that means for families like these in our area.`,
    );
  }
  if (winners.length > 0) {
    lines.push("");
    lines.push(
      `It also indicated that ${joinList(winners)} would benefit. I understand that policy involves trade-offs, but I want to be sure those who stand to lose are not overlooked.`,
    );
  }
  lines.push("");
  lines.push(
    hurt.length > 0
      ? `I respectfully urge you to weigh these distributional effects carefully — and to consider amendments that protect those most exposed — before this bill advances. I would welcome your perspective on it.`
      : `I respectfully ask that you weigh the distributional effects of this bill carefully, and I would welcome your perspective on it.`,
  );
  lines.push("");
  lines.push("Thank you for your time and service.");
  lines.push("Sincerely,");
  lines.push("A concerned constituent");

  return { subject, body: lines.join("\n"), source: "template" };
}

function buildPrompt(input: EmailDraftInput): string {
  const hurt = segmentNames(input.analysis.whoGetsHurt);
  const winners = segmentNames(input.analysis.winners);
  return [
    `Representative: ${input.repTitle} ${input.repName}`,
    `Bill: ${input.billIdentifier} — ${input.billTitle}`,
    `Jurisdiction: ${input.jurisdiction}`,
    `Simulation headline: ${input.analysis.headline}`,
    `Groups hurt most: ${hurt.length ? hurt.join("; ") : "(none clearly identified)"}`,
    `Groups who benefit: ${winners.length ? winners.join("; ") : "(none clearly identified)"}`,
    "",
    "Write the constituent email now.",
  ].join("\n");
}

export async function draftConstituentEmail(input: EmailDraftInput): Promise<EmailDraft> {
  const fallback = templateEmail(input);
  if (!asiConfigured()) return fallback;
  try {
    const res = await asiJSON(INSTRUCTIONS, buildPrompt(input), advocateEmailSchema, 700);
    if (res?.data) return toEmailDraft(res.data);
    return fallback;
  } catch {
    return fallback;
  }
}
