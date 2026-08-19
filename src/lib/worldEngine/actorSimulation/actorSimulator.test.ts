import assert from "node:assert/strict";
import test from "node:test";
import type { AIErrorResponse } from "@/lib/ai/types";
import type { ActorSimulationInput, ActorSimulationTelemetry } from "./types";
import { runActorSimulation } from "./actorSimulator";
import { resolveActorSimulationFlags } from "./config";

const telemetry = (): ActorSimulationTelemetry => ({
  castCandidateCount: 3,
  castSelectedCount: 3,
  simulationMode: "batch_soft",
  simulationRequested: 0,
  simulationFulfilled: 0,
  simulationRejected: 0,
  simulationTimedOut: 0,
  projectionAccepted: 0,
  projectionRejectedByValidator: 0,
  castSelectionLatencyMs: 0,
  actorSimulationLatencyMs: 0,
  directorSynthesisLatencyMs: 0,
  totalTickLatencyMs: 0,
  agendaAccepted: 0,
  agendaRejected: 0,
});

const input = (index: number): ActorSimulationInput => ({
  npcId: `NPC_${index}`,
  npcName: `NPC ${index}`,
  currentGoal: "observe",
  currentFear: null,
  currentNeed: null,
  knownFactIds: [`FACT_${index}`],
  suspectedFactIds: [],
  forbiddenRevealIds: [],
  relationEdges: [],
  currentLocation: "ROOM",
  personalAgenda: null,
  scenePublicFacts: [],
  actorScopedFacts: [],
  horizonTurns: 2,
  simulationId: `sim_${index}`,
});

test("three selected actors use exactly one bounded batch call", async () => {
  let calls = 0;
  let observedTimeout = 0;
  let observedMaxTokens = 0;
  const result = await runActorSimulation({
    inputs: [input(1), input(2), input(3)],
    ctx: { requestId: "req", userId: null, sessionId: "session", path: "/worker", tags: {} },
    telemetry: telemetry(),
    flagsOverride: {
      enabled: true,
      mode: "batch_soft",
      maxActors: 3,
      horizonTurns: 2,
      totalTickBudgetMs: 30_000,
      perActorTimeoutMs: 10_000,
      maxActionsPerActor: 3,
    },
    runBatchTask: async (args) => {
      calls += 1;
      observedTimeout = args.requestTimeoutMs ?? 0;
      observedMaxTokens = args.devOverrides?.maxTokens ?? 0;
      return { ok: false, code: "PROVIDER_ERROR", message: "expected test failure" } as AIErrorResponse;
    },
  });
  assert.equal(calls, 1);
  assert.equal(observedTimeout, 30_000);
  assert.equal(observedMaxTokens, 2_048);
  assert.deepEqual(result.projections, []);
  assert.equal(result.rejectedProjections.length, 3);
});

test("Actor batch failure stays fail-open for the single Director", async () => {
  const result = await runActorSimulation({
    inputs: [input(1)],
    ctx: { requestId: "actor-fail-open", userId: null, sessionId: "session", path: "/worker", tags: {} },
    telemetry: telemetry(),
    flagsOverride: {
      enabled: true,
      mode: "batch_soft",
      maxActors: 3,
      horizonTurns: 2,
      totalTickBudgetMs: 30_000,
      perActorTimeoutMs: 10_000,
      maxActionsPerActor: 3,
    },
    runBatchTask: async () => ({
      ok: false,
      code: "TIMEOUT",
      message: "expected timeout",
    } as AIErrorResponse),
  });
  let directorCalls = 0;
  const runSingleDirector = async (actorContext: string | null) => {
    directorCalls += 1;
    assert.equal(actorContext, null);
  };
  await runSingleDirector(result.projections.length > 0 ? "actor evidence" : null);
  assert.equal(directorCalls, 1);
});

test("Actor batch enforces one wall-clock budget even when the provider ignores its signal", async () => {
  let observedSignal: AbortSignal | undefined;
  const startedAt = Date.now();
  const result = await runActorSimulation({
    inputs: [input(1)],
    ctx: { requestId: "actor-wall-clock", userId: null, sessionId: "session", path: "/worker", tags: {} },
    telemetry: telemetry(),
    flagsOverride: {
      enabled: true,
      mode: "batch_soft",
      maxActors: 3,
      horizonTurns: 2,
      totalTickBudgetMs: 25,
      perActorTimeoutMs: 25,
      maxActionsPerActor: 3,
    },
    runBatchTask: async (args) => {
      observedSignal = args.signal;
      return new Promise<never>(() => {});
    },
  });
  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs < 250, `Actor batch should fail open promptly, got ${elapsedMs}ms`);
  assert.equal(observedSignal?.aborted, true);
  assert.deepEqual(result.projections, []);
  assert.equal(result.telemetry.simulationTimedOut, 1);
  assert.match(result.rejectedProjections[0]?.reason ?? "", /budget exceeded/);
});

test("Actor configuration cannot exceed three actors or thirty seconds", () => {
  const previousActors = process.env.VERSECRAFT_ACTOR_SIMULATION_MAX_ACTORS;
  const previousBudget = process.env.VERSECRAFT_ACTOR_SIMULATION_TICK_BUDGET_MS;
  process.env.VERSECRAFT_ACTOR_SIMULATION_MAX_ACTORS = "99";
  process.env.VERSECRAFT_ACTOR_SIMULATION_TICK_BUDGET_MS = "60000";
  try {
    const flags = resolveActorSimulationFlags();
    assert.equal(flags.maxActors, 3);
    assert.equal(flags.totalTickBudgetMs, 30_000);
  } finally {
    if (previousActors === undefined) delete process.env.VERSECRAFT_ACTOR_SIMULATION_MAX_ACTORS;
    else process.env.VERSECRAFT_ACTOR_SIMULATION_MAX_ACTORS = previousActors;
    if (previousBudget === undefined) delete process.env.VERSECRAFT_ACTOR_SIMULATION_TICK_BUDGET_MS;
    else process.env.VERSECRAFT_ACTOR_SIMULATION_TICK_BUDGET_MS = previousBudget;
  }
});
