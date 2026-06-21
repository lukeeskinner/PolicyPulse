import { z } from "zod";
import { fmtPct } from "@/lib/utils";
import { callClaude, claudeConfigured, claudeJSON, modelId } from "@/lib/llm";
import type {
  Amendment,
  ConstituentOutcome,
  DebateIntent,
  GroundingBrief,
  Position,
  Stakeholder,
  Stance,
  StakeholderDelta,
  Vote,
} from "./types";

// ============================================================================
// Stakeholder Council "brain" — every floor statement is a real Claude call,
// anchored to the constituency's MEASURED outcome from the simulation. There is
// no scripted debate. If Claude is unavailable, each function falls back to a
// transparent, grounded heuristic (stance from the sign of constituent impact,
// vote from the sign of the re-test delta) so a run always completes honestly.
// ============================================================================

export { claudeConfigured };
const GHOST_MODEL = process.env.POLICYPULSE_GHOST_MODEL;
export function councilModelId(): string {
  return modelId(GHOST_MODEL);
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

function briefBlock(b: GroundingBrief): string {
  const hurt = b.whoGetsHurt
    .slice(0, 3)
    .map((s) => `${s.segment} (impact ${s.impactScore}, ${fmtPct(s.displacementRate)} displaced)`)
    .join("; ");
  const win = b.winners
    .slice(0, 2)
    .map((s) => `${s.segment} (+${s.impactScore})`)
    .join("; ");
  return `BILL: "${b.policyTitle}" [${b.policyType}]
SIMULATED OUTCOME on ${b.populationLabel}:
- ${b.headline}
- Inequality (Gini): ${b.giniBefore} -> ${b.giniAfter} (${b.giniAfter > b.giniBefore ? "widened" : "narrowed"})
- ${fmtPct(b.displacementRate)} displaced · ${fmtPct(b.loseShare)} worse off · ${fmtPct(b.winShare)} better off
- Hardest hit: ${hurt || "none clearly"}
- Came out ahead: ${win || "few"}`;
}

function myBlock(o: ConstituentOutcome): string {
  return `YOUR CONSTITUENTS — ${o.label} (n=${o.count}): mean welfare impact ${o.meanImpact >= 0 ? "+" : ""}${o.meanImpact}, ${fmtPct(o.displacementRate)} displaced or forced out.`;
}

function seatSystem(seat: Stakeholder): string {
  return `You are ${seat.name}, the council seat for ${seat.seat}. Mandate: ${seat.mandate}

You are at a live legislative hearing deliberating a bill whose distributional impact has ALREADY been simulated on a statistically representative population of residents. You argue from the EVIDENCE — cite the specific simulated numbers for the people you represent. Be concrete, plain-spoken, and brief (a hearing, not an essay). Pursue your mandate honestly; concede when the evidence genuinely cuts against you.`;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const amendmentRaw = z.object({ title: z.string(), text: z.string(), rationale: z.string() });

const positionSchema = z.object({
  stance: z.enum(["support", "oppose", "conditional"]),
  argument: z.string(),
  citedStat: z.string(),
  amendment: amendmentRaw.optional(),
});

const reactionSchema = z.object({
  intent: z.enum(["support", "oppose", "concede"]),
  message: z.string(),
  cite: z.string().optional(),
});

const voteSchema = z.object({
  vote: z.enum(["aye", "nay", "abstain"]),
  rationale: z.string(),
});

const verdictSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  criticalConcession: z.object({ what: z.string(), why: z.string(), counterfactual: z.string() }),
});

export interface OpeningResult {
  stance: Stance;
  argument: string;
  citedStat: string;
  amendment?: { title: string; text: string; rationale: string };
  considered: string[];
  rejected: { option: string; why: string }[];
  latencyMs: number;
  source: "llm" | "deterministic";
}

// ---------------------------------------------------------------------------
// 1) Opening position
// ---------------------------------------------------------------------------

export async function openingPosition(
  seat: Stakeholder,
  brief: GroundingBrief,
  mine: ConstituentOutcome,
): Promise<OpeningResult> {
  const user = `${briefBlock(brief)}

${myBlock(mine)}

State your OPENING POSITION on this bill as JSON:
{ "stance": "support" | "oppose" | "conditional",
  "argument": "1-2 sentence first-person floor statement",
  "citedStat": "the single simulated number you anchor to",
  "amendment": { "title": "...", "text": "the concrete clause to add to the bill", "rationale": "..." } }
Include "amendment" ONLY if your stance is "conditional" or "oppose" — it is the change that would win your support.`;

  const r = await claudeJSON(seatSystem(seat), user, positionSchema, 700);
  if (r) {
    return {
      stance: r.data.stance,
      argument: r.data.argument,
      citedStat: r.data.citedStat,
      amendment: r.data.amendment,
      considered: [],
      rejected: [],
      latencyMs: r.latencyMs,
      source: "llm",
    };
  }
  return deterministicPosition(seat, brief, mine);
}

/** Grounded fallback: stance follows the sign of constituent welfare impact. */
function deterministicPosition(seat: Stakeholder, brief: GroundingBrief, mine: ConstituentOutcome): OpeningResult {
  const stance: Stance = mine.meanImpact >= 6 ? "support" : mine.meanImpact <= -6 ? "oppose" : "conditional";
  const citedStat = `${mine.label}: mean impact ${mine.meanImpact >= 0 ? "+" : ""}${mine.meanImpact}, ${fmtPct(mine.displacementRate)} displaced`;
  const argument =
    stance === "support"
      ? `${seat.name}: the simulation shows our people come out ahead (${citedStat}). We support it.`
      : stance === "oppose"
        ? `${seat.name}: this bill harms the people we represent (${citedStat}). We oppose it as written.`
        : `${seat.name}: the effect on our constituents is mixed (${citedStat}). We can support it with changes.`;
  const amendment =
    stance === "support"
      ? undefined
      : {
          title: `${seat.name} carve-out`,
          text: `Add protections targeted at ${seat.seat.toLowerCase()} to offset the modeled harm.`,
          rationale: `Offsets the ${citedStat} our constituents absorb under the bill as written.`,
        };
  return { stance, argument, citedStat, amendment, considered: [], rejected: [], latencyMs: 0, source: "deterministic" };
}

// ---------------------------------------------------------------------------
// 2) React to a tabled amendment
// ---------------------------------------------------------------------------

export interface ReactionResult {
  intent: Extract<DebateIntent, "support" | "oppose" | "concede">;
  message: string;
  cite?: string;
  latencyMs: number;
  source: "llm" | "deterministic";
}

export async function reactToAmendment(
  seat: Stakeholder,
  amendment: Amendment,
  proposerName: string,
  brief: GroundingBrief,
  mine: ConstituentOutcome,
): Promise<ReactionResult> {
  const user = `${briefBlock(brief)}

${myBlock(mine)}

${proposerName} has tabled an amendment:
- ${amendment.title}: ${amendment.text}
- Rationale: ${amendment.rationale}

React on the floor as JSON:
{ "intent": "support" | "oppose" | "concede",
  "message": "1 sentence, first person", "cite": "an optional simulated number" }
Use "concede" if you previously resisted but the evidence and this amendment move you toward agreement.`;

  const r = await claudeJSON(seatSystem(seat), user, reactionSchema, 400);
  if (r) return { ...r.data, latencyMs: r.latencyMs, source: "llm" };

  // Fallback: hurt constituencies support relief amendments; winners stay neutral-positive.
  const intent = mine.meanImpact <= -6 ? "support" : "oppose";
  return {
    intent,
    message:
      intent === "support"
        ? `${seat.name} backs ${amendment.title} — our constituents need the relief.`
        : `${seat.name} is wary ${amendment.title} weakens the bill's intent.`,
    cite: `${mine.label} mean impact ${mine.meanImpact}`,
    latencyMs: 0,
    source: "deterministic",
  };
}

// ---------------------------------------------------------------------------
// 3) Closing vote (after the re-test)
// ---------------------------------------------------------------------------

export interface VoteResult {
  vote: Vote;
  rationale: string;
  latencyMs: number;
  source: "llm" | "deterministic";
}

export async function closingVote(
  seat: Stakeholder,
  delta: StakeholderDelta,
  amendedHeadline: string,
  adoptedTitles: string[],
): Promise<VoteResult> {
  const user = `The council amended the bill (${adoptedTitles.join("; ") || "no amendments"}) and RE-SIMULATED it on the identical population.

Result for ${delta.label}: mean welfare impact moved ${delta.before} -> ${delta.after} (${delta.delta >= 0 ? "+" : ""}${delta.delta}).
Overall: ${amendedHeadline}

Cast your final vote as JSON: { "vote": "aye" | "nay" | "abstain", "rationale": "1 sentence" }.`;

  const r = await claudeJSON(seatSystem(seat), user, voteSchema, 300);
  if (r) return { ...r.data, latencyMs: r.latencyMs, source: "llm" };

  const vote: Vote = delta.after >= 4 ? "aye" : delta.after <= -8 ? "nay" : "abstain";
  return {
    vote,
    rationale: `${seat.name}: post-amendment impact for our constituents is ${delta.after >= 0 ? "+" : ""}${delta.after}.`,
    latencyMs: 0,
    source: "deterministic",
  };
}

// ---------------------------------------------------------------------------
// 4) Chair framing + verdict synthesis
// ---------------------------------------------------------------------------

export async function chairFraming(chair: Stakeholder, brief: GroundingBrief, positions: Position[]): Promise<string | null> {
  const stances = positions.map((p) => `${p.stakeholderId}: ${p.stance}`).join("; ");
  const worst = brief.whoGetsHurt[0];
  const user = `${briefBlock(brief)}

Opening stances: ${stances}.

As the Equity Commissioner chairing this hearing, frame the central conflict in ONE sentence — name the inequality at stake (Gini ${brief.giniBefore} -> ${brief.giniAfter}${worst ? `, hardest hit: ${worst.segment}` : ""}) and what the council must resolve. Return plain text only, no JSON.`;
  const r = await callClaude(seatSystem(chair), user, 200);
  return r?.text.trim().replace(/^["']|["']$/g, "") || null;
}

export async function chairVerdict(input: {
  policyTitle: string;
  outcome: string;
  adopted: { title: string; by: string }[];
  beforeAfter: string; // a one-line measured delta
  trace: { round: number; who: string; said: string; conceded: boolean }[];
}): Promise<z.infer<typeof verdictSchema> | null> {
  const system = `You are the Equity Commissioner writing the official read-out of a council hearing. You are given the REAL debate trace and the MEASURED before/after of the adopted amendment(s). Identify the single most consequential concession or amendment and its counterfactual (what the outcome would have been without it). Do not invent events not in the trace. Output JSON: {headline, summary, criticalConcession:{what, why, counterfactual}}.`;
  const traceBlock = input.trace
    .map((t) => `R${t.round} ${t.who}${t.conceded ? " [CONCEDED]" : ""}: ${t.said}`)
    .join("\n");
  const user = `BILL: ${input.policyTitle}
OUTCOME: ${input.outcome}
ADOPTED: ${input.adopted.map((a) => `${a.title} (by ${a.by})`).join("; ") || "none"}
MEASURED EFFECT OF AMENDMENT(S): ${input.beforeAfter}

DEBATE TRACE:
${traceBlock}

Write the read-out now as JSON.`;
  const r = await claudeJSON(system, user, verdictSchema, 700);
  return r?.data ?? null;
}
