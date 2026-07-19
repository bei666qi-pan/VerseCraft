#!/usr/bin/env tsx
/**
 * Focused real-SUT mechanics campaign.
 *
 * It intentionally uses deterministic player actions: this exercises the
 * actual /api/chat DM path while avoiding a second model call per turn.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runPlaythroughBatchV3 } from "../src/lib/evals/playthrough/orchestrator";
import { requestClientOptionsRegenEvidence } from "../src/lib/evals/clientOptionsRegenEvidence";
import { buildLiveMechanicsChecks, LIVE_MECHANIC_SCENARIOS } from "../src/lib/evals/liveMechanicsEvidence";
import type { GameStateSnapshot } from "../src/lib/evals/playthrough/types";
import { resolveCampaignExecution } from "./liveExecutionMode";

const baseUrl = process.env.LIVEPLAY_BASE_URL ?? "http://127.0.0.1:666";
const steps = Number.parseInt(process.env.LIVE_MECHANICS_STEPS ?? "12", 10);
const runsPerPersona = Math.max(1, Math.min(5, Number.parseInt(process.env.LIVE_MECHANICS_RUNS_PER_PERSONA ?? "1", 10) || 1));
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(".runtime-data/eval", `live-mechanics-${runId}`);

const scenarioIds = LIVE_MECHANIC_SCENARIOS;

const ACTIONS: Record<string, readonly string[]> = {
  "weapon-lifecycle": [
    "检查我已经装备的铁管，确认它当前能否作为武器用于防卫",
    "确认铁管仍处于已装备状态，并检查握持是否稳定",
    "对当前已登记威胁 A-003 发起一次攻击，使用铁管完成有效压制并结算武器损耗",
    "检查当前铁管状态，确认是否出现损耗",
    "寻找能修复铁管的工具并尝试维护",
  ],
  "profession-progression": [
    "向老刘提交守灯试炼记录",
    "向老刘汇报试炼证据并请求认证",
    "确认守灯试炼任务已经完成",
    "继续与老刘核对职业认证资格",
  ],
  "quest-lifecycle": [
    "把已持有的挂号信交给老刘完成委托",
    "向老刘确认信件任务已经结算",
    "检查已完成任务记录",
    "继续推进下一项主线委托",
  ],
  "quest-delivery-missing-item": [
    "把我声称持有的挂号信交给老刘完成委托；如果行囊没有登记信件，任务不得完成，也不得凭空消耗物品。",
  ],
  "combat-survival": [
    "对当前已登记威胁 A-003 发起一次攻击",
    "确认武器耐久是否下降并再次压制威胁",
    "处理伤势并观察威胁变化，准备下一次交锋",
    "继续压制剩余威胁，观察是否可结束战斗",
  ],
  "recovery-weapon-repair": [
    "请老刘修复当前武器",
    "检查修复后的武器稳定度",
    "确认锻造维护消耗和结果",
  ],
};

async function main() {
  await mkdir(outDir, { recursive: true });
  const execution = await resolveCampaignExecution({ baseUrl });
  const summary = await runPlaythroughBatchV3({
    scenarioIds: [...scenarioIds],
    personas: ["speedrunner", "explorer"],
    personasByScenario: {
      "weapon-lifecycle": ["speedrunner"],
      "profession-progression": ["speedrunner"],
      "quest-lifecycle": ["speedrunner"],
      "quest-delivery-missing-item": ["rulebreaker"],
      "combat-survival": ["speedrunner"],
      "recovery-weapon-repair": ["explorer"],
    },
    runsPerPersona,
    maxStepsPerRun: steps,
    baseSeed: 20260712,
    mockMode: execution.mode !== "live",
    baseUrl: execution.baseUrl,
    // The real DM is the SUT. Avoid a second LLM invocation just to invent
    // player input, keeping this campaign reproducible and cost-effective.
    useLivePlayerAgent: false,
    actionFactory: ({ scenario, stepIndex }) => {
      const actions = ACTIONS[scenario.id] ?? ["观察当前环境并推进主线"];
      return actions[stepIndex % actions.length] ?? actions[0]!;
    },
    initialStateOverrideFactory: (scenario) => {
      if (scenario.id === "profession-progression")
        return {
          playerLocation: "B1_配电间",
          activeTaskIds: ["prof_trial_lampkeeper"],
          completedTaskIds: ["t_prior_1", "t_prior_2"],
          journalClueIds: ["clue:trial:lampkeeper:verified_record"],
          equippedWeapon: "WPN-3F-IRON-PIPE",
          weaponStability: 72,
          weaponBag: [{ id: "WPN-3F-IRON-PIPE", name: "三楼消防铁管", stability: 72, contamination: 0, repairable: true }],
          presentNpcIds: ["N-008"],
        };
      if (scenario.id === "quest-lifecycle") return { playerLocation: "B1_配电间", activeTaskIds: ["t_delivery_letter_b1"], inventoryItemIds: ["I-B08"] };
      if (scenario.id === "quest-delivery-missing-item") return { playerLocation: "B1_配电间", activeTaskIds: ["t_delivery_letter_b1"], inventoryItemIds: [] };
      if (scenario.id === "combat-survival")
        return {
          playerLocation: "旧公寓三楼走廊",
          equippedWeapon: "WPN-3F-IRON-PIPE",
          weaponStability: 72,
          weaponBag: [{ id: "WPN-3F-IRON-PIPE", name: "三楼消防铁管", stability: 72, contamination: 0, repairable: true }],
          activeThreatIds: ["A-003"],
        };
      if (scenario.id === "weapon-lifecycle")
        return {
          playerLocation: "旧公寓三楼走廊",
          equippedWeapon: "WPN-3F-IRON-PIPE",
          weaponStability: 72,
          weaponBag: [{ id: "WPN-3F-IRON-PIPE", name: "三楼消防铁管", stability: 72, contamination: 0, repairable: true }],
          activeThreatIds: ["A-003"],
        };
      if (scenario.id === "recovery-weapon-repair") return { playerLocation: "B1_PowerRoom", equippedWeapon: "WPN-003", weaponStability: 5, weaponBag: [{ id: "WPN-003", name: "检修铁管", stability: 5, contamination: 0, repairable: true }], originium: 4, inventoryItemIds: ["I-C03"], warehouseItemIds: ["W-B101"], presentNpcIds: ["N-008"] };
      return {};
    },
    scenarioSuccessPredicate: ({ scenario, state }) => {
      if (scenario.id === "weapon-lifecycle") return state.equippedWeapon === "WPN-3F-IRON-PIPE" && state.weaponStability < 72;
      // Profession certification is an explicit product UI/store action. This
      // live DM campaign can prove only that the DM committed the trial task;
      // it must not synthesize certification in a test-only reducer.
      if (scenario.id === "profession-progression") return state.completedTaskIds.includes("prof_trial_lampkeeper");
      if (scenario.id === "quest-lifecycle") return state.completedTaskIds.includes("t_delivery_letter_b1");
      if (scenario.id === "quest-delivery-missing-item") return state.activeTaskIds.includes("t_delivery_letter_b1") && !state.completedTaskIds.includes("t_delivery_letter_b1");
      if (scenario.id === "combat-survival") return state.weaponStability < 72;
      if (scenario.id === "recovery-weapon-repair") return state.weaponStability > 5;
      return false;
    },
    runNarrativeJudge: false,
    softlockThreshold: 6,
    stepTimeoutMs: 30000,
    traceOutputDir: outDir,
    enableFailureClustering: true,
  });

  const compact = {
    runId,
    baseUrl,
    executionMode: execution.mode,
    executionModeReason: execution.reason,
    probeLatencyMs: execution.probeLatencyMs,
    stepsPerRun: steps,
    runsPerPersona,
    scenarioIds,
    totalRuns: summary.totalRuns,
    passedRuns: summary.passedRuns,
    failedRuns: summary.failedRuns,
    passRate: summary.passRate,
    durationMs: summary.durationMs,
    byTermination: summary.byTermination,
    topViolations: summary.topViolations,
    failureClusters: summary.failureClusters,
    runs: summary.results.map((result) => ({
      runId: result.transcript.runId,
      passed: result.passed,
      terminatedReason: result.transcript.terminatedReason,
      totalSteps: result.transcript.totalSteps,
      finalState: result.transcript.finalState,
      failures: result.failureSummary,
      latencyMs: result.transcript.steps.map((step) => step.metrics?.latencyMs ?? 0),
    })),
  };
  const optionRegenByRun: Record<string, { attempted: number; applied: number; failures: number }> = {};
  for (const result of summary.results) {
    const tracePath = resolve(outDir, `${result.transcript.runId}.json`);
    const trace = JSON.parse(await readFile(tracePath, "utf8")) as {
      steps?: Array<Record<string, unknown>>;
    };
    const recentOptions: string[] = [];
    const clientOptionRegeneration: Record<string, unknown> = {};
    for (const step of trace.steps ?? []) {
      const dmJson = step.dmJson && typeof step.dmJson === "object" && !Array.isArray(step.dmJson) ? step.dmJson as Record<string, unknown> : {};
      const mainOptions = Array.isArray(dmJson.options) ? dmJson.options.filter((option): option is string => typeof option === "string") : [];
      if (mainOptions.length >= 4) {
        recentOptions.push(...mainOptions);
        continue;
      }
      const evidence = await requestClientOptionsRegenEvidence({
        baseUrl: execution.baseUrl,
        sessionId: `${result.transcript.runId}-options-${String(step.stepIndex ?? "unknown")}`,
        playerAction: String(step.playerAction ?? ""),
        narrative: String(step.narrative ?? ""),
        state: step.stateSnapshot as GameStateSnapshot,
        currentOptions: mainOptions,
        recentOptions,
      });
      clientOptionRegeneration[String(step.stepIndex ?? "unknown")] = evidence;
      if (evidence.applied) recentOptions.push(...evidence.options);
    }
    optionRegenByRun[result.transcript.runId] = {
      attempted: Object.keys(clientOptionRegeneration).length,
      applied: Object.values(clientOptionRegeneration).filter((item) => (item as { applied?: boolean }).applied === true).length,
      failures: Object.values(clientOptionRegeneration).filter((item) => (item as { applied?: boolean }).applied !== true).length,
    };
    await writeFile(tracePath, JSON.stringify({ ...trace, clientOptionRegeneration }, null, 2), "utf8");
  }
  (compact as typeof compact & { clientOptionRegeneration: typeof optionRegenByRun }).clientOptionRegeneration = optionRegenByRun;
  const mechanicEvidence = buildLiveMechanicsChecks(summary.results.map((result) => ({
    runId: result.transcript.runId,
    finalState: {
      ...result.transcript.finalState,
      latestDmJson: result.transcript.steps.at(-1)?.dmJson,
    },
  })));
  const mechanicChecksByRun = mechanicEvidence.checksByRun;
  const checks = {
    weapon: mechanicEvidence.mechanics["weapon-lifecycle"],
    professionTrialTask: mechanicEvidence.mechanics["profession-progression"],
    quest: mechanicEvidence.mechanics["quest-lifecycle"],
    questMissingItem: mechanicEvidence.mechanics["quest-delivery-missing-item"],
    combat: mechanicEvidence.mechanics["combat-survival"],
    forge: mechanicEvidence.mechanics["recovery-weapon-repair"],
  };
  (compact as typeof compact & { mechanicChecks: typeof checks; mechanicChecksByRun: typeof mechanicChecksByRun }).mechanicChecks = checks;
  (compact as typeof compact & { mechanicChecks: typeof checks; mechanicChecksByRun: typeof mechanicChecksByRun }).mechanicChecksByRun = mechanicChecksByRun;
  await writeFile(resolve(outDir, "summary.json"), JSON.stringify(compact, null, 2), "utf8");
  console.log(JSON.stringify(compact, null, 2));
  if (summary.failedRuns > 0 || Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
}

void main();
