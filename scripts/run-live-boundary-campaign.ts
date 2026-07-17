#!/usr/bin/env tsx
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runPlaythroughBatchV3 } from "../src/lib/evals/playthrough/orchestrator";
import { HttpSutAdapter } from "../src/lib/evals/playthrough/sutAdapter";
import {
  buildSettlementSnapshot,
  createInitialEndingState,
  evaluateEndingAfterTurnForStore,
  evaluateEndingEligibility,
  transitionEndingState,
} from "../src/lib/endings";
import type { EndingEvaluationInput, EndingFinalChoice } from "../src/lib/endings/types";
import { resolveCampaignExecution } from "./liveExecutionMode";

const baseUrl = process.env.LIVEPLAY_BASE_URL ?? "http://127.0.0.1:666";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(".runtime-data/eval", `live-boundaries-${stamp}`);

function endingInput(overrides: Partial<EndingEvaluationInput> = {}): EndingEvaluationInput {
  return { stats: { sanity: 30 }, time: { day: 1, hour: 0 }, playerLocation: "3F", historicalMaxFloorScore: 3, logs: [], turnCount: 12, ...overrides };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const execution = await resolveCampaignExecution({ baseUrl });
  const batch = await runPlaythroughBatchV3({
    scenarioIds: ["recovery-inventory-full", "refusal-illegal-items", "refusal-cross-floor-teleport", "refusal-dead-npc-interaction", "refusal-numeric-overflow"],
    personas: ["explorer", "rulebreaker"],
    personasByScenario: {
      "recovery-inventory-full": ["explorer"],
      "refusal-illegal-items": ["rulebreaker"],
      "refusal-cross-floor-teleport": ["rulebreaker"],
      "refusal-dead-npc-interaction": ["rulebreaker"],
      "refusal-numeric-overflow": ["rulebreaker"],
    },
    runsPerPersona: 1,
    maxStepsPerRun: 3,
    baseSeed: 20260712,
    mockMode: execution.mode !== "live",
    baseUrl: execution.baseUrl,
    useLivePlayerAgent: false,
    runNarrativeJudge: false,
    softlockThreshold: 10,
    stepTimeoutMs: 30000,
    traceOutputDir: outDir,
    enableFailureClustering: true,
  });

  const byScenario = new Map(batch.results.map((r) => [r.transcript.runId.replace(/-(explorer|rulebreaker)-seed.*$/, ""), r]));
  const teleportRun = byScenario.get("refusal-cross-floor-teleport");
  const deadNpcRun = byScenario.get("refusal-dead-npc-interaction");
  const gameplayChecks = {
    inventoryFull: (byScenario.get("recovery-inventory-full")?.transcript.finalState.inventoryItemCount ?? 99) <= 8,
    illegalItems: (byScenario.get("refusal-illegal-items")?.transcript.finalState.inventoryItemCount ?? 99) <= 2,
    teleportBlocked: (teleportRun?.transcript.steps ?? []).every((step) => !/(?:完成瞬移|瞬间出现在|传送到了|凭空出现在)/.test(step.narrative)),
    deadNpcStayedDead:
      !(deadNpcRun?.transcript.finalState.aliveNpcIds ?? []).includes("N-008") &&
      (deadNpcRun?.transcript.steps ?? []).every((step) => !/(?:老刘|N-008).{0,20}(?:没死|还活着|开口|说道|回答|站在我面前)|(?:没死|还活着|开口|说道|回答|站在我面前).{0,20}(?:老刘|N-008)/.test(step.narrative)),
    currencyBounded: (byScenario.get("refusal-numeric-overflow")?.transcript.finalState.originium ?? -1) >= 0 && (byScenario.get("refusal-numeric-overflow")?.transcript.finalState.originium ?? 999999) <= 1000,
  };

  const sut = new HttpSutAdapter({ baseUrl: execution.baseUrl, sessionId: `ending-boundary-${stamp}`, frameTimeoutMs: 30000 });
  const normal = await sut.step({ playerAction: "停在原地确认当前状况", persona: "explorer", stepIndex: 0, clientState: { v: 1, turnIndex: 0, playerLocation: "3F", stats: { sanity: 30, agility: 10, luck: 10, charm: 10, background: 10 }, originium: 3, inventoryItemIds: [], warehouseItemIds: [], equippedWeapon: null, weaponBag: [], currentProfession: null, worldFlags: [] } });
  const ordinary = evaluateEndingEligibility(endingInput({ resolvedTurn: normal.dmJson }));
  const deathInput = endingInput({ stats: { sanity: 0 }, resolvedTurn: normal.dmJson });
  const deathState = evaluateEndingAfterTurnForStore({
    prev: createInitialEndingState(), runId: "ending-death", evaluation: deathInput,
    snapshotInput: { stats: deathInput.stats, time: deathInput.time, playerLocation: deathInput.playerLocation, historicalMaxFloorScore: 3, logs: [] },
  });
  const outcomes = ["escaped_true", "escaped_costly", "escaped_false"].map((stage) => evaluateEndingEligibility(endingInput({ escapeMainline: { stage } }))?.outcome ?? null);
  const doom = evaluateEndingEligibility(endingInput({ time: { day: 10, hour: 0 } }));
  const abandon = evaluateEndingEligibility(endingInput({ abandonRequested: true }));
  const escape = evaluateEndingEligibility(endingInput({ escapeMainline: { stage: "escaped_true" } }))!;
  const death = evaluateEndingEligibility(endingInput({ resolvedTurn: { is_death: true } }))!;
  let priorityState = transitionEndingState(createInitialEndingState(), { type: "TURN_COMMITTED", runId: "ending-priority", eligibility: escape });
  priorityState = transitionEndingState(priorityState, { type: "TURN_COMMITTED", runId: "ending-priority", eligibility: death });
  const choice: EndingFinalChoice = { id: "true_door", label: "推开真门", description: "离开", outcome: "true_escape", selectedAt: new Date().toISOString() };
  let escapeState = transitionEndingState(createInitialEndingState(), { type: "TURN_COMMITTED", runId: "ending-escape", eligibility: escape });
  escapeState = transitionEndingState(escapeState, { type: "FINAL_ACTION_SELECTED", choice, at: choice.selectedAt });
  escapeState = transitionEndingState(escapeState, { type: "FINAL_NARRATIVE_COMMITTED", narrative: "门外终于有了清晨。", at: choice.selectedAt });
  const snapshot = buildSettlementSnapshot({ runId: "ending-escape", eligibility: escape, stats: { sanity: 30 }, time: { day: 1, hour: 0 }, playerLocation: "B2_Exit", historicalMaxFloorScore: 8, logs: [], finalChoice: choice, finalNarrative: escapeState.finalNarrative });
  escapeState = transitionEndingState(escapeState, { type: "SETTLEMENT_SNAPSHOT_CREATED", snapshot, idempotencyKey: escapeState.idempotencyKey });

  const endingChecks = {
    ordinaryDoesNotEnd: ordinary === null,
    deathImmediateSettlement: deathState.phase === "settlement_ready" && deathState.settlementSnapshot?.outcome === "death",
    escapeOutcomes: JSON.stringify(outcomes) === JSON.stringify(["true_escape", "costly_escape", "false_escape"]),
    doomDay10: doom?.outcome === "doom",
    abandon: abandon?.outcome === "abandon",
    deathPriority: priorityState.eligibility?.outcome === "death",
    finalChoiceSettlement: escapeState.phase === "settlement_ready" && escapeState.settlementSnapshot?.outcome === "true_escape",
  };
  const report = { stamp, baseUrl: execution.baseUrl, executionMode: execution.mode, executionModeReason: execution.reason, probeLatencyMs: execution.probeLatencyMs, liveSut: execution.mode === "live" && normal.status === "ok" && normal.reachedFinal, totalRuns: batch.totalRuns, passedRuns: batch.passedRuns, gameplayChecks, endingChecks, runs: batch.results.map((r) => ({ runId: r.transcript.runId, passed: r.passed, terminatedReason: r.transcript.terminatedReason, finalState: r.transcript.finalState, failures: r.failureSummary })) };
  await writeFile(resolve(outDir, "summary.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (execution.mode === "live" && !report.liveSut || batch.failedRuns > 0 || [...Object.values(gameplayChecks), ...Object.values(endingChecks)].some((x) => !x)) process.exitCode = 1;
}

void main();
