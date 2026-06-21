import { roleLabel } from "./engine";
import type { AgentRecord, PolicyModel } from "./types";
import { fmtPct, fmtUSD } from "./utils";

// Deterministic, template-based first-person story used when no LLM key is set.
// The Resident agent (Haiku) produces a richer version when ANTHROPIC_API_KEY
// is configured.

export function templateNarrative(record: AgentRecord, model: PolicyModel): string {
  const p = record.persona;
  const base = record.history[0].state;
  const cur = record.current;
  const role = roleLabel(p.roles).toLowerCase();

  const household =
    p.householdSize > 1 ? `a household of ${p.householdSize}` : "living alone";
  const tenure = p.tenure === "renter" ? "renting" : "a homeowner";

  const sentences: string[] = [];
  sentences.push(
    `I'm ${p.name}, ${p.age}, ${tenure} in ${p.neighborhood} and ${household}. I work in ${p.sector.toLowerCase()}.`,
  );
  sentences.push(
    `Before the policy, ${fmtPct(base.rentBurden)} of my ${fmtUSD(base.income)} income went to housing.`,
  );

  const flags = new Set<string>();
  for (const h of record.history) h.state.flags.forEach((f) => flags.add(f));

  if (flags.has("rent_capped")) {
    sentences.push(
      `When ${model.title.toLowerCase()} passed, my rent increases were capped — for once I could plan ahead and stay in my neighborhood.`,
    );
  }
  if (flags.has("wage_raise")) {
    sentences.push(`My hourly pay climbed toward the new floor, and my paycheck finally stretched a little further.`);
  }
  if (flags.has("hours_cut")) {
    sentences.push(`But my manager trimmed my hours, so the raise didn't translate into much more take-home pay.`);
  }
  if (flags.has("job_loss")) {
    sentences.push(`Then the cuts came and I lost my job — the thing I feared most.`);
  }
  if (flags.has("displaced") && !flags.has("left_city")) {
    sentences.push(`My building changed hands and I wasn't renewed. I found another place, farther out and costlier.`);
  }
  if (flags.has("left_city")) {
    sentences.push(`In the end I couldn't make the numbers work, and I left the city I'd called home.`);
  }
  if (flags.has("landlord_exit")) {
    sentences.push(`As a small landlord, the math stopped working, so I sold the unit I used to rent out.`);
  }
  if (flags.has("margin_squeeze")) {
    sentences.push(`I kept renting out my unit, but on much thinner margins than before.`);
  }
  if (flags.has("business_closed")) {
    sentences.push(`The rising costs were too much for my small business, and I had to close.`);
  }

  const verdict =
    record.outcome === "better"
      ? `Three years on, I'm somewhat better off — ${fmtPct(cur.rentBurden)} of income now goes to housing.`
      : record.outcome === "worse"
        ? `Three years on, I'm worse off than when this started.`
        : record.outcome === "displaced"
          ? `Three years on, I've been pushed out of where I started.`
          : `Three years on, not much changed for me either way.`;
  sentences.push(verdict);

  return sentences.join(" ");
}
