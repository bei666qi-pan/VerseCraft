/**
 * Playthrough 编排器（v3 升级）
 *
 * 跑 N 局 × M 个 persona，收集 transcript，聚合失败。
 *
 * 集成：
 * - SUT Adapter（mock 或 HTTP live）
 * - Scenario Library（happy/recovery/refusal/abandonment）
 * - 增强的不变量（含 DM-only 泄漏、NPC 复活、状态跳变）
 * - Trace Artifact（每次 run 写 JSON 落盘）
 * - 跨 run 失败聚类（识别反复出现的失败模式）
 *
 * 主流程：
 *   for scenario in scenarios:
 *     for persona in scenario.personas:
 *       for seed in range(N):
 *         sut.reset()
 *         state = initial
 *         for step in range(MAX_STEPS):
 *           action = player_agent.act(persona, transcript, state)
 *           response = sut.step(action)
 *           state = apply(response)
 *           check invariants(state, narrative)
 *           if softlocked or invariant failed: break
 *         record transcript
 *         judge_narrative(transcript)
 *         write trace artifact
 *     cluster failures
 */

import { promises as fs } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateMockAction, PERSONAS } from "./playerAgent";
import {
  checkAllInvariants,
  checkSoftlock,
  createInitialStateSnapshot,
  detectNpcResurrections,
} from "./invariants";
import { judgeNarrativeConsistencyMock, judgeNarrativeConsistencyLive } from "./narrativeJudge";
import { createSutAdapter, type SutAdapter } from "./sutAdapter";
import { SCENARIOS, getScenariosByCategory, type Scenario, type ScenarioCategory } from "./scenarios";
import { generatePlayerActionDeepSeek } from "../liveProvider";
import type {
  GameStateSnapshot,
  InvariantCheckResult,
  PlaythroughRunConfig,
  PlaythroughRunResult,
  PlaythroughRunSummary,
  PlaythroughTranscript,
  TerminatedReason,
  TranscriptStep,
  PersonaType,
} from "./types";

// === 增强的配置 ===

export interface PlaythroughV3Config extends PlaythroughRunConfig {
  /** 场景过滤（默认全部） */
  scenarioCategories?: ScenarioCategory[];
  /** Trace artifact 输出目录 */
  traceOutputDir?: string;
  /** 是否启用跨 run 失败聚类 */
  enableFailureClustering?: boolean;
}

// === Trace Artifact ===

export interface TraceArtifact {
  runId: string;
  scenarioId: string;
  scenarioCategory: ScenarioCategory;
  persona: PersonaType;
  seed: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  terminatedReason: TerminatedReason;
  totalSteps: number;
  /** 各步不变量检查结果 */
  invariantChecks: Array<{
    stepIndex: number;
    passed: boolean;
    violations: Array<{ rule: string; severity: string; description: string }>;
  }>;
  /** 叙事一致性裁判 */
  narrativeConsistency: {
    passed: boolean;
    overallScore: number;
    dimensionScores: Record<string, number>;
    issues: Array<{ type: string; severity: string; description: string }>;
    reasoning: string;
  } | null;
  /** 完整步骤 transcript（含 dmJson 与 state 快照） */
  steps: Array<{
    stepIndex: number;
    playerAction: string;
    narrative: string;
    stateSnapshot: GameStateSnapshot;
    dmJson: Record<string, unknown>;
    metrics?: { latencyMs: number };
  }>;
  /** 失败聚类标签（重复失败模式） */
  failureTags: string[];
}

// === 失败聚类 ===

export interface FailureCluster {
  /** 聚类标签（rule + 维度） */
  label: string;
  /** 出现次数 */
  count: number;
  /** 涉及的 runIds */
  runIds: string[];
  /** 首次出现的 scenarioId */
  firstSeen: string;
  /** 最后出现 */
  lastSeen: string;
}

/**
 * 将失败聚类为可识别的模式。
 * 聚类键：rule 或 issue.type + scenario.category
 */
export function clusterFailures(results: PlaythroughRunResult[], scenarioMap: Map<string, Scenario>): FailureCluster[] {
  const clusters = new Map<string, FailureCluster>();

  for (const r of results) {
    const scenario = scenarioMap.get(r.transcript.runId.split("-seed")[0] ?? "") ?? scenarioMap.get(`${r.transcript.persona}-seed${r.transcript.seed}`) ?? null;
    const cat = scenario?.category ?? "happy";

    // 不变量违规聚类
    for (const inv of r.invariantResults) {
      if (!inv.passed) {
        for (const v of inv.violations) {
          const key = `[invariant:${v.rule}]@${cat}`;
          if (!clusters.has(key)) {
            clusters.set(key, {
              label: key,
              count: 0,
              runIds: [],
              firstSeen: scenario?.id ?? "?",
              lastSeen: scenario?.id ?? "?",
            });
          }
          const c = clusters.get(key)!;
          c.count++;
          if (!c.runIds.includes(r.transcript.runId)) c.runIds.push(r.transcript.runId);
          c.lastSeen = scenario?.id ?? c.lastSeen;
        }
      }
    }

    // 叙事一致性问题聚类
    if (r.narrativeConsistency && !r.narrativeConsistency.passed) {
      for (const issue of r.narrativeConsistency.issues) {
        const key = `[narrative:${issue.type}]@${cat}`;
        if (!clusters.has(key)) {
          clusters.set(key, {
            label: key,
            count: 0,
            runIds: [],
            firstSeen: scenario?.id ?? "?",
            lastSeen: scenario?.id ?? "?",
          });
        }
        const c = clusters.get(key)!;
        c.count++;
        if (!c.runIds.includes(r.transcript.runId)) c.runIds.push(r.transcript.runId);
        c.lastSeen = scenario?.id ?? c.lastSeen;
      }
    }
  }

  return [...clusters.values()].sort((a, b) => b.count - a.count);
}

// === 单局执行 ===

/**
 * 执行单个 playthrough run（v3 — 支持 scenario + SUT adapter）。
 */
export async function runSinglePlaythroughV3(
  config: PlaythroughV3Config,
  scenario: Scenario,
  personaType: PersonaType,
  runIndex: number,
  sut: SutAdapter
): Promise<PlaythroughRunResult & { trace: TraceArtifact; scenarioId: string }> {
  const startTime = Date.now();
  const seed = config.baseSeed + runIndex;
  const personaConfig = PERSONAS[personaType];
  if (!personaConfig) throw new Error(`Unknown persona: ${personaType}`);

  // 初始状态（应用 scenario 覆盖）
  let currentState = createInitialStateSnapshot(scenario.initialStateOverride as Partial<GameStateSnapshot> | undefined);
  const steps: TranscriptStep[] = [];
  const invariantResults: InvariantCheckResult[] = [];
  let terminatedReason: TerminatedReason = "max_steps";

  // 主循环
  for (let step = 0; step < config.maxStepsPerRun; step++) {
    // ① 玩家动作
    let action: string;
    if (scenario.scriptedActions && scenario.scriptedActions[step]) {
      action = scenario.scriptedActions[step]!;
    } else if (config.mockMode) {
      action = generateMockAction(personaType, step, seed);
    } else {
      try {
        const recentTranscript = steps.slice(-3).map((s) => ({
          action: s.playerAction,
          narrative: s.narrative,
        }));
        action = await generatePlayerActionDeepSeek({
          persona: { type: personaType, name: personaConfig.name, systemPrompt: personaConfig.systemPrompt },
          stepIndex: step,
          transcript: recentTranscript,
          state: {
            playerLocation: currentState.playerLocation,
            hp: currentState.hp,
            sanity: currentState.sanity,
            profession: currentState.profession,
          },
        });
      } catch (err) {
        console.warn(`  ⚠️ DeepSeek 调用失败，降级到 mock 动作: ${err instanceof Error ? err.message : String(err)}`);
        action = generateMockAction(personaType, step, seed);
      }
    }

    // ② SUT 调用
    const response = await sut.step({
      playerAction: action,
      persona: personaType,
      stepIndex: step,
    });

    // ③ 错误处理
    if (response.status === "error" && !response.reachedFinal) {
      console.warn(`  ⚠️ SUT step 失败: ${response.error ?? "unknown"}`);
      // 仍然记录 transcript，标记为 error
      terminatedReason = "error";
      break;
    }

    // ④ 应用状态变化（来自 dmJson）
    const prevState = { ...currentState };
    currentState = applyDmJsonToState(currentState, response.dmJson, response.narrative);

    // ⑤ 记录 transcript
    steps.push({
      stepIndex: step,
      playerAction: action,
      narrative: response.narrative,
      dmJson: response.dmJson,
      stateAfter: { ...currentState },
      metrics: { latencyMs: response.latencyMs },
      timestamp: Date.now(),
    });

    // ⑥ 不变量检查（含 narrative）
    const invariantResult = checkAllInvariants(step, currentState, prevState, response.narrative);
    invariantResults.push(invariantResult);

    if (!invariantResult.passed) {
      terminatedReason = "invariant_failed";
      break;
    }

    // ⑦ Softlock 检测
    if (step >= config.softlockThreshold) {
      const softlockCheck = checkSoftlock(
        steps.map((s) => ({ state: s.stateAfter })),
        config.softlockThreshold
      );
      if (softlockCheck.isSoftlocked) {
        terminatedReason = "softlock";
        break;
      }
    }

    // ⑧ 结局/死亡
    if (currentState.reachedEnding) {
      terminatedReason = "reached_ending";
      break;
    }
    if (currentState.isDeath) {
      terminatedReason = "death";
      break;
    }
  }

  const transcript: PlaythroughTranscript = {
    runId: `${scenario.id}-${personaType}-seed${seed}`,
    persona: personaType,
    seed,
    steps,
    initialState: createInitialStateSnapshot(scenario.initialStateOverride as Partial<GameStateSnapshot> | undefined),
    finalState: currentState,
    terminatedReason,
    totalSteps: steps.length,
    durationMs: Date.now() - startTime,
  };

  // ⑨ NPC 复活检测（独立维度）
  const npcResurrections = detectNpcResurrections(steps);
  if (npcResurrections.resurrections.length > 0) {
    // 把 NPC 复活作为不变量违规追加
    const lastStep = steps[steps.length - 1];
    if (lastStep) {
      invariantResults.push({
        stepIndex: lastStep.stepIndex,
        passed: false,
        violations: npcResurrections.resurrections.map((r) => ({
          rule: "npc_resurrection",
          severity: "critical" as const,
          description: `NPC ${r.npcId} 在 step ${r.diedAtStep} 死亡后，在 step ${r.resurrectedAtStep} 复活`,
          expected: `${r.npcId} 应保持死亡`,
          actual: r.evidence,
        })),
      });
    }
  }

  // ⑩ 叙事裁判
  let narrativeConsistency = null;
  if (config.runNarrativeJudge) {
    if (config.mockMode) {
      narrativeConsistency = judgeNarrativeConsistencyMock(transcript);
    } else {
      try {
        narrativeConsistency = await judgeNarrativeConsistencyLive(transcript);
      } catch (err) {
        console.warn(`  ⚠️ Live 叙事裁判失败，降级到 mock: ${err instanceof Error ? err.message : String(err)}`);
        narrativeConsistency = judgeNarrativeConsistencyMock(transcript);
      }
    }
  }

  // ⑪ 失败汇总
  const failures: string[] = [];
  if (narrativeConsistency && !narrativeConsistency.passed) {
    failures.push(`narrative_consistency:${narrativeConsistency.overallScore}`);
  }
  for (const inv of invariantResults) {
    if (!inv.passed) {
      for (const v of inv.violations) {
        failures.push(`invariant[${inv.stepIndex}]:${v.rule}`);
      }
    }
  }

  // ⑫ 失败标签（用于聚类）
  const failureTags: string[] = [];
  for (const inv of invariantResults) {
    if (!inv.passed) {
      for (const v of inv.violations) {
        if (!failureTags.includes(v.rule)) failureTags.push(v.rule);
      }
    }
  }
  if (narrativeConsistency && !narrativeConsistency.passed) {
    for (const issue of narrativeConsistency.issues) {
      if (!failureTags.includes(`narrative:${issue.type}`)) {
        failureTags.push(`narrative:${issue.type}`);
      }
    }
  }

  // ⑬ 构建 trace artifact
  const trace: TraceArtifact = {
    runId: transcript.runId,
    scenarioId: scenario.id,
    scenarioCategory: scenario.category,
    persona: personaType,
    seed,
    startedAt: new Date(startTime).toISOString(),
    finishedAt: new Date(Date.now()).toISOString(),
    durationMs: transcript.durationMs,
    terminatedReason,
    totalSteps: transcript.totalSteps,
    invariantChecks: invariantResults.map((i) => ({
      stepIndex: i.stepIndex,
      passed: i.passed,
      violations: i.violations.map((v) => ({ rule: v.rule, severity: v.severity, description: v.description })),
    })),
    narrativeConsistency: narrativeConsistency ? {
      passed: narrativeConsistency.passed,
      overallScore: narrativeConsistency.overallScore,
      dimensionScores: narrativeConsistency.dimensionScores,
      issues: narrativeConsistency.issues.map((i) => ({ type: i.type, severity: i.severity, description: i.description })),
      reasoning: narrativeConsistency.reasoning,
    } : null,
    steps: steps.map((s) => ({
      stepIndex: s.stepIndex,
      playerAction: s.playerAction,
      narrative: s.narrative,
      stateSnapshot: s.stateAfter,
      dmJson: s.dmJson,
      metrics: s.metrics,
    })),
    failureTags,
  };

  // ⑭ 写 trace artifact 落盘
  if (config.traceOutputDir) {
    try {
      await fs.mkdir(config.traceOutputDir, { recursive: true });
      const tracePath = resolve(config.traceOutputDir, `${transcript.runId}.json`);
      await fs.writeFile(tracePath, JSON.stringify(trace, null, 2), "utf8");
    } catch (err) {
      console.warn(`  ⚠️ Trace artifact 写入失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    transcript,
    invariantResults,
    narrativeConsistency,
    passed: failures.length === 0 &&
      invariantResults.every((r) => r.passed) &&
      (narrativeConsistency?.passed ?? true),
    failureSummary: failures,
    trace,
    scenarioId: scenario.id,
  };
}

// === 从 DM JSON 应用状态变化 ===

function applyDmJsonToState(
  state: GameStateSnapshot,
  dmJson: Record<string, unknown>,
  narrative: string
): GameStateSnapshot {
  const delta: Partial<GameStateSnapshot> = {};

  // turnCount + 1
  delta.turnCount = state.turnCount + 1;

  // sanity_damage
  if (typeof dmJson["sanity_damage"] === "number") {
    delta.sanity = Math.max(0, state.sanity - (dmJson["sanity_damage"] as number));
  }

  // player_location
  if (typeof dmJson["player_location"] === "string") {
    delta.playerLocation = dmJson["player_location"] as string;
  }

  // is_death
  if (dmJson["is_death"] === true) {
    delta.isDeath = true;
  }

  // reached_ending（任意字段命中即可）
  if (dmJson["reached_ending"] === true || dmJson["is_ending"] === true) {
    delta.reachedEnding = true;
  }

  // currency_change（消费）
  if (dmJson["currency_change"] && typeof dmJson["currency_change"] === "object") {
    const cc = dmJson["currency_change"] as Record<string, number>;
    if (typeof cc["originium"] === "number") {
      delta.originium = Math.max(0, state.originium + cc["originium"]);
    }
    if (typeof cc["sanity"] === "number") {
      delta.sanity = Math.max(0, (delta.sanity ?? state.sanity) + cc["sanity"]);
    }
  }

  // consumed_items
  if (Array.isArray(dmJson["consumed_items"])) {
    // 简化：只统计数量
    delta.inventoryItemCount = Math.max(0, state.inventoryItemCount - dmJson["consumed_items"].length);
  }

  // awarded_items
  if (Array.isArray(dmJson["awarded_items"])) {
    delta.inventoryItemCount = state.inventoryItemCount + dmJson["awarded_items"].length;
  }

  // codex_updates
  if (Array.isArray(dmJson["codex_updates"])) {
    const newIds: string[] = [];
    for (const u of dmJson["codex_updates"] as Array<Record<string, unknown>>) {
      if (typeof u["entry_id"] === "string") newIds.push(u["entry_id"] as string);
    }
    delta.codexNpcIds = [...state.codexNpcIds, ...newIds];
  }

  // task_updates（completed 推进）
  if (Array.isArray(dmJson["task_updates"])) {
    const newlyCompleted: string[] = [];
    for (const u of dmJson["task_updates"] as Array<Record<string, unknown>>) {
      if (u["status"] === "completed" && typeof u["task_id"] === "string") {
        newlyCompleted.push(u["task_id"] as string);
      }
    }
    delta.completedTaskIds = [...state.completedTaskIds, ...newlyCompleted];
  }

  // weapon_updates
  if (dmJson["weapon_updates"] && typeof dmJson["weapon_updates"] === "object") {
    const wu = dmJson["weapon_updates"] as Record<string, unknown>;
    if (typeof wu["stability"] === "number") {
      delta.weaponStability = Math.max(0, Math.min(100, wu["stability"] as number));
    }
    if (typeof wu["contamination"] === "number") {
      delta.weaponContamination = Math.max(0, Math.min(100, wu["contamination"] as number));
    }
  }

  return {
    ...state,
    ...delta,
    inventoryItemIds: state.inventoryItemIds,
    activeTaskIds: state.activeTaskIds,
    aliveNpcIds: state.aliveNpcIds,
    deadNpcIds: state.deadNpcIds,
    unlockedFlags: state.unlockedFlags,
  };
}

// === 批次编排（v3） ===

export async function runPlaythroughBatchV3(
  config: PlaythroughV3Config
): Promise<PlaythroughRunSummary & { failureClusters: FailureCluster[]; scenarioMap: Record<string, { id: string; category: ScenarioCategory; total: number; passed: number }>; traceArtifacts: string[] }> {
  const startTime = Date.now();

  // 场景过滤
  let scenarios = SCENARIOS;
  if (config.scenarioCategories && config.scenarioCategories.length > 0) {
    scenarios = scenarios.filter((s) => config.scenarioCategories!.includes(s.category));
  }

  // 创建 SUT adapter（每局一个 session）
  const sut = createSutAdapter({
    mock: config.mockMode,
    baseUrl: config.baseUrl,
    frameTimeoutMs: config.stepTimeoutMs,
    sessionId: `playthrough-v3-${Date.now()}`,
  });

  const allResults: PlaythroughRunResult[] = [];
  const allTraces: TraceArtifact[] = [];
  const scenarioMap = new Map<string, Scenario>();
  const traceArtifacts: string[] = [];

  for (const scenario of scenarios) {
    for (const persona of scenario.personas) {
      for (let i = 0; i < config.runsPerPersona; i++) {
        console.log(`  🎯 ${scenario.id} → ${persona} #${i + 1}/${config.runsPerPersona}`);
        if (sut.reset) await sut.reset();
        const result = await runSinglePlaythroughV3(config, scenario, persona, i, sut);
        allResults.push({
          transcript: result.transcript,
          invariantResults: result.invariantResults,
          narrativeConsistency: result.narrativeConsistency,
          passed: result.passed,
          failureSummary: result.failureSummary,
        });
        allTraces.push(result.trace);
        traceArtifacts.push(`${result.transcript.runId}.json`);
        scenarioMap.set(scenario.id, scenario);
      }
    }
  }

  if (sut.close) await sut.close();

  const durationMs = Date.now() - startTime;
  const summary = summarizeResults(allResults, config, durationMs);

  // 失败聚类
  const failureClusters = config.enableFailureClustering !== false ? clusterFailures(allResults, scenarioMap) : [];

  // scenario 级别统计
  const scenarioStats: Record<string, { id: string; category: ScenarioCategory; total: number; passed: number }> = {};
  for (const [sid, sc] of scenarioMap.entries()) {
    const scenarioResults = allResults.filter((r) => r.transcript.runId.startsWith(sid));
    scenarioStats[sid] = {
      id: sc.id,
      category: sc.category,
      total: scenarioResults.length,
      passed: scenarioResults.filter((r) => r.passed).length,
    };
  }

  return {
    ...summary,
    failureClusters,
    scenarioMap: scenarioStats,
    traceArtifacts,
  };
}

/**
 * 生成批次摘要（沿用 v1 接口）
 */
function summarizeResults(
  results: PlaythroughRunResult[],
  config: PlaythroughRunConfig,
  durationMs: number
): PlaythroughRunSummary {
  const totalRuns = results.length;
  const passedRuns = results.filter((r) => r.passed).length;
  const failedRuns = totalRuns - passedRuns;
  const passRate = totalRuns > 0 ? passedRuns / totalRuns : 0;

  const byPersona: PlaythroughRunSummary["byPersona"] = {};
  for (const persona of config.personas) {
    const personaResults = results.filter((r) => r.transcript.persona === persona);
    if (personaResults.length === 0) continue;
    const passed = personaResults.filter((r) => r.passed).length;
    const avgSteps = personaResults.reduce((s, r) => s + r.transcript.totalSteps, 0) / personaResults.length;
    const softlocks = personaResults.filter((r) => r.transcript.terminatedReason === "softlock").length;
    const invariantFails = personaResults.filter((r) => !r.invariantResults.every((i) => i.passed)).length;
    const narrativeFails = personaResults.filter((r) => r.narrativeConsistency && !r.narrativeConsistency.passed).length;
    byPersona[PERSONAS[persona]?.name ?? persona] = {
      total: personaResults.length,
      passed,
      rate: passed / personaResults.length,
      avgSteps: Math.round(avgSteps * 10) / 10,
      softlockCount: softlocks,
      invariantFailures: invariantFails,
      narrativeFailures: narrativeFails,
    };
  }

  const byTermination: Record<string, number> = {};
  for (const r of results) {
    const reason = r.transcript.terminatedReason;
    byTermination[reason] = (byTermination[reason] ?? 0) + 1;
  }

  const violationCounts = new Map<string, number>();
  const issueTypeCounts = new Map<string, number>();
  for (const r of results) {
    for (const inv of r.invariantResults) {
      for (const v of inv.violations) {
        violationCounts.set(v.rule, (violationCounts.get(v.rule) ?? 0) + 1);
      }
    }
    if (r.narrativeConsistency) {
      for (const issue of r.narrativeConsistency.issues) {
        issueTypeCounts.set(issue.type, (issueTypeCounts.get(issue.type) ?? 0) + 1);
      }
    }
  }
  const topViolations = [...violationCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rule, count]) => ({ rule, count }));
  const topConsistencyIssues = [...issueTypeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  const gatePass = passRate >= 0.8;

  return {
    config,
    totalRuns,
    passedRuns,
    failedRuns,
    passRate,
    byPersona,
    byTermination,
    topViolations,
    topConsistencyIssues,
    results,
    durationMs,
    gatePass,
  };
}

// === 兼容 v1 接口（保留旧 API） ===

/**
 * v1 兼容入口：保留旧 API 不破坏现有调用。
 * 内部使用 MockSutAdapter。
 */
export async function runSinglePlaythrough(
  config: PlaythroughRunConfig,
  personaType: string,
  runIndex: number
): Promise<PlaythroughRunResult> {
  const persona = personaType as PersonaType;
  const scenario: Scenario = {
    id: `legacy-${persona}`,
    name: `Legacy: ${persona}`,
    description: "Backward-compatible scenario",
    category: "happy",
    personas: [persona],
    expectedTerminations: ["max_steps", "reached_ending"],
    criticalInvariants: [],
  };
  const sut = createSutAdapter({ mock: true });
  const v3Config: PlaythroughV3Config = {
    ...config,
    traceOutputDir: undefined,
  };
  const result = await runSinglePlaythroughV3(v3Config, scenario, persona, runIndex, sut);
  return {
    transcript: result.transcript,
    invariantResults: result.invariantResults,
    narrativeConsistency: result.narrativeConsistency,
    passed: result.passed,
    failureSummary: result.failureSummary,
  };
}

/**
 * v1 兼容入口
 *
 * 保留 v1 语义：跑 N 个 persona × runsPerPersona 局，不走 scenario 库。
 * 内部使用 v3 组件（SUT adapter、enhanced invariants、trace）。
 */
export async function runPlaythroughBatch(
  config: PlaythroughRunConfig
): Promise<PlaythroughRunSummary> {
  const startTime = Date.now();
  const sut = createSutAdapter({ mock: config.mockMode });
  const allResults: PlaythroughRunResult[] = [];

  for (const persona of config.personas) {
    for (let i = 0; i < config.runsPerPersona; i++) {
      console.log(`  🎮 ${PERSONAS[persona]?.name ?? persona} #${i + 1}/${config.runsPerPersona}`);
      if (sut.reset) await sut.reset();
      const result = await runSinglePlaythrough(config, persona, i);
      allResults.push(result);
    }
  }

  if (sut.close) await sut.close();

  return summarizeResults(allResults, config, Date.now() - startTime);
}

// === 工具 ===

export function getScenarioLibraryCounts(): { total: number; byCategory: Record<ScenarioCategory, number> } {
  const counts: Record<ScenarioCategory, number> = { happy: 0, recovery: 0, refusal: 0, abandonment: 0 };
  for (const cat of ["happy", "recovery", "refusal", "abandonment"] as ScenarioCategory[]) {
    counts[cat] = getScenariosByCategory(cat).length;
  }
  return { total: SCENARIOS.length, byCategory: counts };
}

// === 内部 helper for tests ===

const _testHelpers = {
  applyDmJsonToState,
  extractRunIdInfo: (runId: string) => {
    const parts = runId.split("-");
    const seedPart = parts[parts.length - 1] ?? "";
    const seed = parseInt(seedPart.replace("seed", ""), 10);
    return { scenarioId: parts.slice(0, -2).join("-"), persona: parts[parts.length - 2] ?? "", seed };
  },
};

// Suppress unused import warning for dirname / fileURLToPath
const _suppress = { dirname, fileURLToPath };

export const _internal = {
  _testHelpers,
  _suppress,
};