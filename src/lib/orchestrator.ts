import { emit } from "./bus";
import { SimulationEngine } from "./engine";
import { loadProfile } from "./ingest";
import { analyze, computeRoundMetrics } from "./metrics";
import { spawnPersonas } from "./personas";
import * as runStore from "./runStore";
import {
  ROUNDS,
  type Persona,
  type PublicAgent,
  type RoundDef,
  type RunMeta,
  type SimRequest,
} from "./types";
import { makeRng, runId, sleep } from "./utils";

// ============================================================================
// Live simulation orchestrator.
//
// runSimulation() returns a runId immediately and drives the pipeline async,
// emitting paced events through the bus so the dashboard animates in real time:
//   policy analysis -> ingestion -> agent spawning -> round-by-round simulation
//   (with cascading shocks) -> inequality analysis.
// ============================================================================

const DELAY = {
  source: 120,
  spawn: 16,
  update: 7,
  cascade: 150,
  roundStart: 360,
  betweenRounds: 320,
  phase: 220,
};

const BASELINE_ROUND: RoundDef = { index: -1, label: "Today", monthsElapsed: 0 };

function toPublic(p: Persona): PublicAgent {
  return {
    id: p.id,
    name: p.name,
    group: p.group,
    neighborhood: p.neighborhood,
    tenure: p.tenure,
    roles: p.roles,
    incomeBracket: p.incomeBracket,
    income: p.income,
    colorKey: p.colorKey,
    nativity: p.nativity,
    householdSize: p.householdSize,
    lowWage: p.lowWage,
  };
}

export function runSimulation(req: SimRequest): string {
  const id = runId();
  const meta: RunMeta = {
    runId: id,
    policy: req.policy,
    jurisdiction: req.jurisdiction,
    agentCount: req.agentCount,
    createdAt: Date.now(),
    status: "running",
  };
  runStore.createRun(meta);
  void execute(id, meta, req);
  return id;
}

async function execute(id: string, meta: RunMeta, req: SimRequest): Promise<void> {
  const start = Date.now();
  const now = () => Date.now();
  try {
    const rng = makeRng(`${req.jurisdiction}:${req.policy}:${req.agentCount}`);

    // 1. ingest + analyze (awaited; may call the LLM analyst)
    const { profile } = await loadProfile(req.jurisdiction, req.stateCode);
    const { runPolicyAnalysis } = await import("@/mastra/agents/policy-analyst");
    const model = await runPolicyAnalysis(req.policy, req.jurisdiction);

    emit({ type: "run_started", runId: id, meta, policyModel: model, rounds: ROUNDS, ts: now() });

    // 2. show ingestion sources lighting up
    for (const source of profile.sources) {
      emit({ type: "ingest_source", runId: id, source, ts: now() });
      await sleep(DELAY.source);
    }
    emit({ type: "ingest_complete", runId: id, profile, ts: now() });
    await sleep(DELAY.phase);

    // 3. spawn proportional personas
    const { personas, breakdown } = spawnPersonas(profile, req.agentCount, rng);
    let i = 0;
    for (const p of personas) {
      emit({ type: "agent_spawned", runId: id, agent: toPublic(p), index: i++, total: personas.length, ts: now() });
      await sleep(DELAY.spawn);
    }
    emit({ type: "spawn_complete", runId: id, total: personas.length, breakdown, ts: now() });
    await sleep(DELAY.phase);

    // 4. build engine + baseline metrics
    const engine = new SimulationEngine(profile, model, personas, rng);
    const baselineAvgBurden =
      engine.agents.reduce((s, a) => s + a.history[0].state.rentBurden, 0) /
      Math.max(engine.agents.length, 1);
    emit({
      type: "metrics",
      runId: id,
      metrics: computeRoundMetrics(engine.agents, profile, BASELINE_ROUND, 100, baselineAvgBurden),
      ts: now(),
    });

    // 5. simulate rounds
    for (const round of ROUNDS) {
      emit({ type: "round_started", runId: id, round, ts: now() });
      await sleep(DELAY.roundStart);

      const { updates, cascades, supplyIndex } = engine.step(round);

      for (const c of cascades) {
        emit({ type: "cascade", runId: id, cascade: c, ts: now() });
        await sleep(DELAY.cascade);
      }

      for (const u of updates) {
        emit({
          type: "agent_update",
          runId: id,
          agentId: u.agentId,
          round: u.round,
          state: u.state,
          decision: u.decision,
          note: u.note,
          ts: now(),
        });
        await sleep(DELAY.update);
      }

      emit({
        type: "metrics",
        runId: id,
        metrics: computeRoundMetrics(engine.agents, profile, round, supplyIndex, baselineAvgBurden),
        ts: now(),
      });
      emit({ type: "round_complete", runId: id, round: round.index, ts: now() });
      await sleep(DELAY.betweenRounds);
    }

    // 6. finalize + inequality analysis
    const agents = engine.finalize();
    runStore.setAgents(id, agents);
    const analysis = analyze(agents, profile, model, engine.supplyIndex);
    emit({ type: "analysis", runId: id, analysis, ts: now() });
    await sleep(DELAY.phase);

    emit({ type: "run_complete", runId: id, durationMs: Date.now() - start, ts: now() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Simulation failed";
    emit({ type: "error", runId: id, message, ts: now() });
    emit({ type: "run_complete", runId: id, durationMs: Date.now() - start, ts: now() });
  }
}
