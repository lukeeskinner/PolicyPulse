import type { NextRequest } from "next/server";
import { SimulationEngine } from "@/lib/engine";
import { getCase, HISTORICAL_CASES, type PredictedKey } from "@/lib/historical";
import { loadProfile } from "@/lib/ingest";
import { spawnPersonas } from "@/lib/personas";
import { ROUNDS } from "@/lib/types";
import { makeRng } from "@/lib/utils";
import { runPolicyAnalysis } from "@/mastra/agents/policy-analyst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Direction = "up" | "down" | "mixed";
interface Predicted {
  value: number;
  display: string;
  direction: Direction;
}

export async function GET() {
  return Response.json({ cases: HISTORICAL_CASES });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const c = getCase((body?.caseId ?? "").toString());
  if (!c) return Response.json({ error: "Unknown case" }, { status: 404 });

  const rng = makeRng(`validate:${c.id}`);
  const { profile } = await loadProfile(c.jurisdiction);
  const model = await runPolicyAnalysis(c.policy, c.jurisdiction);
  const { personas } = spawnPersonas(profile, c.agentCount, rng);
  const engine = new SimulationEngine(profile, model, personas, rng);
  for (const r of ROUNDS) engine.step(r);
  const agents = engine.finalize();

  const total = Math.max(agents.length, 1);
  const renters = agents.filter((a) => a.persona.tenure === "renter");
  const lowWageWorkers = agents.filter((a) => a.persona.lowWage && a.persona.roles.includes("worker"));
  const baseRenterBurden = renters.length
    ? renters.reduce((s, a) => s + a.history[0].state.rentBurden, 0) / renters.length
    : 0;
  const finalRenterBurden = renters.length
    ? renters.reduce((s, a) => s + a.current.rentBurden, 0) / renters.length
    : 0;

  const supplyChange = engine.supplyIndex - 100;
  const rentersBetterOff = renters.length ? renters.filter((a) => a.impactScore > 0).length / renters.length : 0;
  const displacement = agents.filter((a) => a.current.displaced || a.current.leftJurisdiction).length / total;
  const hoursLoss = lowWageWorkers.length ? lowWageWorkers.filter((a) => a.current.hours < 1).length / lowWageWorkers.length : 0;
  const burdenDelta = (finalRenterBurden - baseRenterBurden) * 100;

  const predicted: Record<PredictedKey, Predicted> = {
    supplyChangePct: {
      value: supplyChange,
      display: `${supplyChange > 0 ? "+" : ""}${supplyChange.toFixed(0)}% supply`,
      direction: supplyChange < -1 ? "down" : supplyChange > 1 ? "up" : "mixed",
    },
    rentersBetterOffPct: {
      value: rentersBetterOff,
      display: `${Math.round(rentersBetterOff * 100)}% of renters better off`,
      direction: rentersBetterOff > 0.55 ? "up" : rentersBetterOff < 0.35 ? "down" : "mixed",
    },
    displacementRate: {
      value: displacement,
      display: `${Math.round(displacement * 100)}% displaced`,
      direction: displacement > 0.02 ? "up" : "mixed",
    },
    lowWageHoursLossPct: {
      value: hoursLoss,
      display: `${Math.round(hoursLoss * 100)}% lost hours`,
      direction: hoursLoss > 0.1 ? "down" : "mixed",
    },
    avgRentBurdenDeltaPct: {
      value: burdenDelta,
      display: `${burdenDelta > 0 ? "+" : ""}${burdenDelta.toFixed(1)} pts rent burden`,
      direction: burdenDelta < -0.5 ? "down" : burdenDelta > 0.5 ? "up" : "mixed",
    },
  };

  return Response.json({
    caseId: c.id,
    model: { type: model.type, title: model.title, source: model.modelSource },
    predicted,
  });
}
