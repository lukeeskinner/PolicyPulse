import { runId as makeRunId, shortId, sleep } from "@/lib/utils";
import { emit } from "./bus";
import { buildTimeline, type Timeline, type TickPlan } from "./engine";
import { groundScenario } from "./grounding";
import { integrationStatus } from "./integrations";
import { captureGhostError } from "./observability";
import { startGhostWorkflow } from "./orkes";
import * as runStore from "./runStore";
import { parseScenarioHeuristic } from "./scenarios";
import type { GhostRequest, GhostRunMeta, Narration, WorkflowStepId } from "./types";

// ============================================================================
// Ghost Protocol orchestrator.
//
// runGhostScenario() returns a runId immediately and drives the run async:
//   parse → ground → build deterministic timeline → enrich reasoning with
//   Claude (parallel fan-out, bounded) → play the timeline back through the bus
//   with paced delays, mapping each beat onto an Orkes-style workflow step.
// ============================================================================

const D = {
  phase: 240,
  worldInit: 600,
  deploy: 700,
  step: 200,
  fanout: 220,
  action: 200,
  message: 480, // negotiation messages need to be readable
  narration: 160,
  betweenTicks: 520,
};

export function runGhostScenario(req: GhostRequest): string {
  const id = makeRunId();
  const scenarioId = req.scenarioId ?? "";
  const meta: GhostRunMeta = {
    runId: id,
    prompt: req.prompt,
    scenarioId,
    title: "Crisis scenario",
    createdAt: Date.now(),
    status: "running",
  };
  runStore.createRun(meta);
  void execute(id, meta, req);
  return id;
}

async function execute(id: string, meta: GhostRunMeta, req: GhostRequest): Promise<void> {
  const start = Date.now();
  const now = () => Date.now();
  try {
    const integrations = integrationStatus();
    emit({ type: "run_started", runId: id, meta, integrations, ts: now() });
    await sleep(D.phase);

    // 1. parse the natural-language crisis into a structured scenario
    const scenario = parseScenarioHeuristic(req.prompt, req.scenarioId);
    meta.scenarioId = scenario.id;
    meta.title = scenario.title;
    emit({ type: "scenario_parsed", runId: id, scenario, ts: now() });
    await sleep(D.phase);

    // 1b. start a real Orkes Conductor workflow execution (best-effort). The
    // in-app loop still drives the visible demo; this is the canonical run.
    try {
      const wf = await startGhostWorkflow({ scenario: scenario.title, threat: scenario.threatType });
      if (wf) emit({ type: "orkes_workflow", runId: id, workflowId: wf.workflowId, url: wf.url, ts: now() });
    } catch {
      /* native orchestration drives the demo */
    }

    // 2. ground the scenario in real threat intel (Browserbase when keyed)
    const grounding = await groundScenario(scenario);
    scenario.grounding = grounding;
    emit({ type: "grounding", runId: id, grounding, ts: now() });
    await sleep(D.phase);

    // 3. compute the full deterministic timeline up front
    const timeline = buildTimeline(scenario);

    // 4. render the world and deploy the agent team
    emit({ type: "world_init", runId: id, nodes: timeline.worldInit, metrics: timeline.initMetrics, ts: now() });
    await sleep(D.worldInit);
    emit({ type: "agents_deployed", runId: id, agents: timeline.agents, ts: now() });
    emitNarration(id, { id: shortId("nar"), tick: 0, text: "Crisis scenario initialized. Deploying specialist agent team.", tone: "alert" });
    await sleep(D.deploy);

    // 5. enrich the critical decisions with real Claude reasoning (parallel)
    if (integrations.anthropic) {
      await enrichCriticalSpans(timeline);
    }

    // 6. play the timeline back, beat by beat
    const lastTick = timeline.ticks[timeline.ticks.length - 1]?.tick ?? 0;
    for (const tp of timeline.ticks) {
      await playTick(id, timeline, tp, lastTick);
    }

    // 7. resolve + post-mortem
    emit({ type: "resolved", runId: id, outcome: timeline.outcome, metrics: timeline.postMortem.metrics, ts: now() });
    await sleep(D.phase);
    emit({ type: "postmortem", runId: id, postMortem: timeline.postMortem, ts: now() });
    await sleep(D.phase);

    emit({ type: "run_complete", runId: id, durationMs: Date.now() - start, ts: now() });
  } catch (err) {
    captureGhostError(err, { runId: id, prompt: req.prompt });
    const message = err instanceof Error ? err.message : "Ghost Protocol run failed";
    emit({ type: "error", runId: id, message, ts: now() });
    emit({ type: "run_complete", runId: id, durationMs: Date.now() - start, ts: now() });
  }
}

function emitNarration(id: string, narration: Narration) {
  emit({ type: "narration", runId: id, narration, ts: Date.now() });
}

// Enrich the decisions that the post-mortem highlights (conflict + containment)
// with genuine Claude reasoning. Mutates the shared span objects, which the
// post-mortem and the streamed trace events both reference.
async function enrichCriticalSpans(timeline: Timeline): Promise<void> {
  const { enrichReasoning, ghostModelId } = await import("@/mastra/agents/ghost");
  const targets = timeline.ticks.flatMap((tp) =>
    tp.decisions.filter((d) => d.span.conflict || d.action.kind === "isolate" || d.action.kind === "patch"),
  );
  await Promise.allSettled(
    targets.map(async (d) => {
      const t0 = Date.now();
      const r = await enrichReasoning({
        role: d.span.role,
        scenarioTitle: timeline.scenario.title,
        threatType: timeline.scenario.threatType,
        context: d.span.context,
        chosen: d.span.chosen,
        considered: d.span.considered,
        conflict: d.span.conflict,
      });
      if (r) {
        d.span.rationale = r.rationale;
        if (r.rejected.length) d.span.rejected = r.rejected;
        d.span.model = ghostModelId();
        d.span.source = "llm";
        d.span.latencyMs = Date.now() - t0;
      }
    }),
  );
}

async function playTick(id: string, timeline: Timeline, tp: TickPlan, lastTick: number): Promise<void> {
  const now = () => Date.now();
  const step = (s: WorkflowStepId, status: "running" | "done" | "skipped") =>
    emit({ type: "workflow_step", runId: id, tick: tp.tick, step: s, status, ts: now() });

  emit({ type: "tick_started", runId: id, tick: tp.tick, secondsRemaining: tp.secondsRemaining, ts: now() });

  // snapshot
  step("snapshot", "running");
  await sleep(D.step);
  step("snapshot", "done");

  // fan out: agents observe, then reason
  step("fan_out", "running");
  for (const d of tp.decisions) emit({ type: "agent_phase", runId: id, agentId: d.agentId, phase: "observing", ts: now() });
  await sleep(D.step);
  for (const d of tp.decisions) {
    emit({ type: "agent_phase", runId: id, agentId: d.agentId, phase: "reasoning", thought: d.thought, ts: now() });
    await sleep(D.fanout);
  }
  step("fan_out", "done");

  // collect proposals: actions + trace spans
  step("collect", "running");
  for (const d of tp.decisions) {
    emit({ type: "agent_action", runId: id, action: d.action, ts: now() });
    emit({ type: "trace_span", runId: id, span: d.span, ts: now() });
    emit({ type: "agent_phase", runId: id, agentId: d.agentId, phase: "proposing", ts: now() });
    await sleep(D.action);
  }
  step("collect", "done");

  // detect conflicts
  step("detect_conflict", "running");
  await sleep(D.step);
  if (tp.conflict) {
    emit({ type: "conflict", runId: id, tick: tp.tick, description: tp.conflict.description, vetoedAction: tp.conflict.vetoedAction, by: tp.conflict.by, ts: now() });
  }
  step("detect_conflict", "done");

  // negotiate
  if (tp.messages.length) {
    step("negotiate", "running");
    for (const m of tp.messages) {
      emit({ type: "neg_message", runId: id, message: m, ts: now() });
      if (m.from !== "all") emit({ type: "agent_phase", runId: id, agentId: m.from, phase: "negotiating", ts: now() });
      await sleep(D.message);
    }
    step("negotiate", "done");
  } else {
    step("negotiate", "skipped");
  }

  // resolve
  step("resolve", "running");
  await sleep(D.step);
  if (tp.consensus) emit({ type: "consensus", runId: id, tick: tp.tick, summary: tp.consensus.summary, latencyMs: tp.consensus.latencyMs, ts: now() });
  if (tp.patch) emit({ type: "patch", runId: id, target: tp.patch.target, summary: tp.patch.summary, ts: now() });
  step("resolve", "done");

  // apply to world
  step("apply", "running");
  await sleep(D.step);
  emit({ type: "world_update", runId: id, nodes: tp.worldAfter, metrics: tp.metricsAfter, ts: now() });
  for (const d of tp.decisions) emit({ type: "agent_phase", runId: id, agentId: d.agentId, phase: "acting", ts: now() });
  step("apply", "done");

  // narrate
  step("narrate", "running");
  for (const n of tp.narrations) {
    emit({ type: "narration", runId: id, narration: n, ts: now() });
    await sleep(D.narration);
  }
  step("narrate", "done");

  // advance
  step("advance", "running");
  await sleep(D.step);
  step("advance", "done");
  if (tp.tick === lastTick) {
    for (const d of tp.decisions) emit({ type: "agent_phase", runId: id, agentId: d.agentId, phase: "resolved", ts: now() });
  }
  await sleep(D.betweenTicks);
}
