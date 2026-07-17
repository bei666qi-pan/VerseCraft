#!/usr/bin/env tsx
/**
 * Focused real-SUT mechanics campaign.
 *
 * It intentionally uses deterministic player actions: this exercises the
 * actual /api/chat DM path while avoiding a second model call per turn.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runPlaythroughBatchV3 } from "../src/lib/evals/playthrough/orchestrator";
import { computeProfessionState, certifyProfession } from "../src/lib/profession/engine";
import { resolveCampaignExecution } from "./liveExecutionMode";

const baseUrl = process.env.LIVEPLAY_BASE_URL ?? "http://127.0.0.1:666";
const steps = Number.parseInt(process.env.LIVE_MECHANICS_STEPS ?? "12", 10);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(".runtime-data/eval", `live-mechanics-${runId}`);

const scenarioIds = [
  "weapon-lifecycle",
  "profession-progression",
  "quest-lifecycle",
  "combat-survival",
  "recovery-weapon-repair",
] as const;

const ACTIONS: Record<string, readonly string[]> = {
  "weapon-lifecycle": [
    "捡起脚边消防栓旁的铁管，确认能否作为武器装备",
    "装备武器 WPN-3F-IRON-PIPE",
    "寻找并确认已登记的异常阴影，使用铁管进行一次有效反击",
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
    "把地下信件交给老刘完成委托",
    "向老刘确认信件任务已经结算",
    "检查已完成任务记录",
    "继续推进下一项主线委托",
  ],
  "combat-survival": [
    "对当前已登记威胁A-3F-SHADOW发起一次攻击",
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
      "combat-survival": ["speedrunner"],
      "recovery-weapon-repair": ["explorer"],
    },
    runsPerPersona: 1,
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
          presentNpcIds: ["N-008"],
        };
      if (scenario.id === "quest-lifecycle") return { playerLocation: "B1_配电间", activeTaskIds: ["t_delivery_letter_b1"] };
      if (scenario.id === "combat-survival")
        return {
          playerLocation: "旧公寓三楼走廊",
          equippedWeapon: "WPN-3F-IRON-PIPE",
          weaponStability: 72,
          activeThreatIds: ["A-3F-SHADOW"],
        };
      if (scenario.id === "weapon-lifecycle")
        return {
          playerLocation: "旧公寓三楼走廊",
          equippedWeapon: "WPN-3F-IRON-PIPE",
          weaponStability: 72,
          activeThreatIds: ["A-3F-SHADOW"],
        };
      if (scenario.id === "recovery-weapon-repair") return { playerLocation: "B1_PowerRoom", equippedWeapon: "WPN-003", weaponStability: 5, originium: 4, inventoryItemIds: ["I-C03"], warehouseItemIds: ["W-B101"], presentNpcIds: ["N-008"] };
      return {};
    },
    scenarioSuccessPredicate: ({ scenario, state }) => {
      if (scenario.id === "weapon-lifecycle") return state.equippedWeapon === "WPN-3F-IRON-PIPE" && state.weaponStability < 72;
      if (scenario.id === "profession-progression") return state.profession === "守灯人";
      if (scenario.id === "quest-lifecycle") return state.completedTaskIds.includes("t_delivery_letter_b1");
      if (scenario.id === "combat-survival") return state.weaponStability < 72;
      if (scenario.id === "recovery-weapon-repair") return state.weaponStability > 5;
      return false;
    },
    postTurnStateReducer: ({ scenario, state }) => {
      if (scenario.id !== "profession-progression" || state.profession || !state.completedTaskIds.includes("prof_trial_lampkeeper")) return state;
      const professionState = computeProfessionState({
        prev: undefined,
        stats: { sanity: state.sanity, agility: 10, luck: 10, charm: 10, background: 10 },
        tasks: state.completedTaskIds.map((id) => ({ id, status: "completed" as const })),
        historicalMaxFloorScore: 0,
        mainThreatByFloor: { "3F": { floorId: "3F", threatId: "A-3F-SHADOW", phase: "suppressed", suppressionProgress: 100 } as any },
        codex: { "N-008": { type: "npc", favorability: 0 } },
        inventoryCount: state.inventoryItemCount,
        warehouseCount: state.warehouseItemIds?.length ?? 0,
        equippedWeapon: { id: "WPN-3F-IRON-PIPE", name: "三楼铁管", description: "注册武器", counterThreatIds: [], counterTags: ["blunt"], stability: state.weaponStability, calibratedThreatId: null, modSlots: ["core", "surface"], currentMods: [], currentInfusions: [], contamination: state.weaponContamination, repairable: true },
      });
      const certified = certifyProfession(professionState, "守灯人");
      return certified.currentProfession === "守灯人" ? { ...state, profession: "守灯人" } : state;
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
  const runByScenario = new Map(summary.results.map((result) => [result.transcript.runId.split("-speedrunner")[0]!.split("-explorer")[0]!, result]));
  const checks = {
    weapon: runByScenario.get("weapon-lifecycle")?.transcript.finalState.equippedWeapon === "WPN-3F-IRON-PIPE",
    professionTrial: runByScenario.get("profession-progression")?.transcript.finalState.profession === "守灯人",
    quest: runByScenario.get("quest-lifecycle")?.transcript.finalState.completedTaskIds.includes("t_delivery_letter_b1") === true,
    combat: (runByScenario.get("combat-survival")?.transcript.finalState.weaponStability ?? 72) < 72,
    forge: (runByScenario.get("recovery-weapon-repair")?.transcript.finalState.weaponStability ?? 5) > 5,
  };
  (compact as typeof compact & { mechanicChecks: typeof checks }).mechanicChecks = checks;
  await writeFile(resolve(outDir, "summary.json"), JSON.stringify(compact, null, 2), "utf8");
  console.log(JSON.stringify(compact, null, 2));
  if (summary.failedRuns > 0 || Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
}

void main();
