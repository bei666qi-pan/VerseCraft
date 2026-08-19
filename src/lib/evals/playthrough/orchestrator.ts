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
import { resolveExperimentProvenance } from "@/lib/evals/harness/provenance";
import { generateMockAction, PERSONAS } from "./playerAgent";
import {
  checkAllInvariants,
  checkSoftlock,
  createInitialStateSnapshot,
  detectNpcResurrections,
  detectNarrativeRepetitions,
  detectNpcStateChurn,
  detectRelationshipDrift,
} from "./invariants";
import { judgeNarrativeConsistencyMock, judgeNarrativeConsistencyLive, judgeNarrativeConsistencyCodex } from "./narrativeJudge";
import { createSutAdapter, type SutAdapter } from "./sutAdapter";
import { isRetryableSutDegradation } from "./sutAdapter";
import { applyDmJsonToState } from "./stateApply";
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
  RunFailureContext,
} from "./types";

// === 增强的配置 ===

export interface PlaythroughV3Config extends PlaythroughRunConfig {
  /** Run only these explicit scenario ids (use for focused live campaigns). */
  scenarioIds?: string[];
  /** Whether a live run should spend an additional LLM call to generate player actions. */
  useLivePlayerAgent?: boolean;
  /** Deterministic, scenario-aware actions for reproducible live mechanics tests. */
  actionFactory?: (input: { scenario: Scenario; persona: PersonaType; stepIndex: number; state: GameStateSnapshot }) => string;
  /** Additional authored starting state for a focused mechanics campaign. */
  initialStateOverrideFactory?: (scenario: Scenario) => Partial<GameStateSnapshot>;
  personasByScenario?: Record<string, PersonaType[]>;
  scenarioSuccessPredicate?: (input: { scenario: Scenario; state: GameStateSnapshot; stepIndex: number }) => boolean;
  postTurnStateReducer?: (input: { scenario: Scenario; state: GameStateSnapshot; stepIndex: number }) => GameStateSnapshot;
  /** 场景过滤（默认全部） */
  scenarioCategories?: ScenarioCategory[];
  /** Trace artifact 输出目录 */
  traceOutputDir?: string;
  /** 是否启用跨 run 失败聚类 */
  enableFailureClustering?: boolean;

  /** 叙事裁判模式：
   * mock  - 完全离线规则裁判
   * codex - 离线专家裁判（增强规则）
   * live  - 调 DeepSeek 裁判
   * auto  - 默认：mock 先判，若通过可再试一次 live
   */
  narrativeJudgeMode?: "auto" | "mock" | "live" | "codex";
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
  /** 实验溯源身份 */
  provenance: import("@/lib/evals/harness/types").ExperimentProvenance;
  /** 首回合前的权威状态；用于审计首次状态变更。 */
  initialState: GameStateSnapshot;
  /** 各步不变量检查结果 */
  invariantChecks: Array<{
    stepIndex: number;
    passed: boolean;
    violations: Array<{ rule: string; severity: string; description: string }>;
  }>;
  failureContext?: RunFailureContext;
  /** 叙事一致性裁判 */
  narrativeConsistency: {
    runId: string;
    passed: boolean;
    overallScore: number;
    dimensionScores: Record<string, number>;
    issues: Array<{ type: string; severity: string; description: string }>;
    reasoning: string;
    judgeMode?: "mock" | "live" | "codex" | "fallback";
    judgeModel?: string;
    judgeLatencyMs?: number;
    judgeTokens?: {
      prompt: number;
      completion: number;
      total: number;
    };
    judgeConfidence?: number;
    judgeConfidenceSource?: "model" | "codex" | "mock" | "fallback" | "estimated";
    judgeError?: string;
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
  /** n-gram 叙事重复率（0-1） */
  narrativeRepetitionRate: number;
  /** 关系漂移次数 */
  relationshipDriftCount: number;
  /** NPC 状态抖动次数 */
  npcStateChurnCount: number;
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
  const initialOverride = {
    ...(scenario.initialStateOverride as Partial<GameStateSnapshot> | undefined),
    ...(config.initialStateOverrideFactory?.(scenario) ?? {}),
  };
  let currentState = createInitialStateSnapshot(initialOverride);
  const steps: TranscriptStep[] = [];
  const invariantResults: InvariantCheckResult[] = [];
  let terminatedReason: TerminatedReason = "max_steps";
  let failureContext: RunFailureContext | null = null;

  const buildFailureContext = (args: {
    stepIndex: number;
    action: string;
    response: { status: string; aiStatus?: string; error?: string; dmJson: Record<string, unknown> };
    mode: RunFailureContext["stepFailureMode"];
  }): RunFailureContext => {
    const rawInternalMeta = args.response.dmJson.internal_meta;
    const internalMeta = rawInternalMeta && typeof rawInternalMeta === "object" && !Array.isArray(rawInternalMeta)
      ? rawInternalMeta as Record<string, unknown>
      : null;
    const reason = String(internalMeta?.reason ?? internalMeta?.action ?? args.response.error ?? args.response.aiStatus ?? "unknown");
    const narrative = typeof args.response.dmJson.narrative === "string" ? args.response.dmJson.narrative : "";
    return {
      stepIndex: args.stepIndex,
      action: args.action,
      reason,
      transportStatus: args.response.status,
      aiStatus: args.response.aiStatus,
      hasVisibleNarrative: narrative.trim().length > 0,
      stepFailureMode: args.mode,
    };
  };

  // 主循环
  for (let step = 0; step < config.maxStepsPerRun; step++) {
    // ① 玩家动作
    let action: string;
    if (scenario.scriptedActions && scenario.scriptedActions[step]) {
      action = scenario.scriptedActions[step]!;
    } else if (config.actionFactory) {
      action = config.actionFactory({ scenario, persona: personaType, stepIndex: step, state: currentState });
    } else if (config.mockMode) {
      action = generateMockAction(personaType, step, seed);
    } else if (config.useLivePlayerAgent === true) {
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
    } else {
      // The SUT remains real; deterministic player actions keep a mechanics
      // campaign reproducible and avoid paying for a second model per turn.
      action = generateMockAction(personaType, step, seed);
    }

  // ② SUT 调用
    let response = await sut.step({
      playerAction: action,
      persona: personaType,
      stepIndex: step,
      // Mirror the client-first payload sent by /play.  A live harness that
      // omits this packet tests a different (and much weaker) server path.
      playerContext: buildPlayerContext(currentState),
      clientState: buildClientStructuredSnapshot(currentState),
    });

    // ②.1 对瞬时 degradied 做一次快速重试，避免因短暂抖动导致误判为真实失败。
    if (
      response.status === "degraded" &&
      !config.mockMode &&
      isRetryableSutDegradation(response.aiStatus, response)
    ) {
      console.warn(`  ↻ 发现可重试 degraded，重试当前回合（persona=${personaType}, step=${step}）`);
      const retry = await sut.step({
        playerAction: action,
        persona: personaType,
        stepIndex: step,
        playerContext: buildPlayerContext(currentState),
        clientState: buildClientStructuredSnapshot(currentState),
      });
      response = retry;
      if (response.status === "error" || response.status === "degraded") {
        failureContext = buildFailureContext({
          stepIndex: step,
          action,
          response,
          mode: response.status === "error" ? "step_error" : "step_degraded_after_retry",
        });
      } else {
        failureContext = null;
      }
    }

    // ③ 错误处理
    if (response.status === "error" && !response.reachedFinal) {
      console.warn(`  ⚠️ SUT step 失败: ${response.error ?? "unknown"}`);
      failureContext ??= buildFailureContext({
        stepIndex: step,
        action,
        response,
        mode: "step_error",
      });
      // 仍然记录 transcript，标记为 error
      terminatedReason = "error";
      break;
    }
    if (response.status === "degraded") {
      failureContext = buildFailureContext({
        stepIndex: step,
        action,
        response,
        mode: "step_degraded",
      });
      terminatedReason = "error";
      break;
    }

    // ④ 应用状态变化（来自 dmJson）
    const prevState = { ...currentState };
    currentState = applyDmJsonToState(currentState, response.dmJson, response.narrative);
    if (config.postTurnStateReducer) {
      currentState = config.postTurnStateReducer({ scenario, state: currentState, stepIndex: step });
    }

    // ⑤ 记录 transcript
    steps.push({
      stepIndex: step,
      playerAction: action,
      narrative: response.narrative,
      dmJson: response.dmJson,
      stateAfter: { ...currentState },
        metrics: {
          latencyMs: response.latencyMs,
          ...(() => {
            const evalMetrics = response.dmJson._eval_metrics;
            if (!evalMetrics || typeof evalMetrics !== "object" || Array.isArray(evalMetrics)) return {};
            const raw = evalMetrics as Record<string, unknown>;
            return {
              ...(typeof raw.input_tokens === "number" ? { inputTokens: raw.input_tokens } : {}),
              ...(typeof raw.output_tokens === "number" ? { outputTokens: raw.output_tokens } : {}),
              ...(typeof raw.cached_input_tokens === "number" ? { cachedInputTokens: raw.cached_input_tokens } : {}),
            };
          })(),
        },
      timestamp: Date.now(),
    });

    // ⑥ 不变量检查（含 narrative & DM JSON）
    const invariantResult = checkAllInvariants(step, currentState, prevState, response.narrative, response.dmJson);
    invariantResults.push(invariantResult);

    if (!invariantResult.passed) {
      failureContext = buildFailureContext({
        stepIndex: step,
        action,
        response,
        mode: "invariant_failure",
      });
      terminatedReason = "invariant_failed";
      break;
    }

    if (config.scenarioSuccessPredicate?.({ scenario, state: currentState, stepIndex: step })) {
      terminatedReason = "objective_reached";
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
        failureContext = {
          stepIndex: step,
          action,
          reason: "softlock_detected",
          stepFailureMode: "softlock",
          transportStatus: "softlock",
        };
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
    initialState: createInitialStateSnapshot(initialOverride),
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
    const judgeMode = config.narrativeJudgeMode ?? "auto";

    if (judgeMode === "codex") {
      narrativeConsistency = await judgeNarrativeConsistencyCodex(transcript);
    } else if (judgeMode === "mock") {
      narrativeConsistency = judgeNarrativeConsistencyMock(transcript);
    } else if (judgeMode === "live") {
      try {
        narrativeConsistency = await judgeNarrativeConsistencyLive(transcript);
      } catch (err) {
        console.warn(`  ⚠️ Live 叙事裁判失败，本次证据不可评分: ${err instanceof Error ? err.message : String(err)}`);
        narrativeConsistency = null;
      }
    } else {
      // auto: mock 为第一道筛选，若通过则再尝试一次真实裁判
      const baseJudge = judgeNarrativeConsistencyMock(transcript);
      if (baseJudge.passed) {
        try {
          narrativeConsistency = await judgeNarrativeConsistencyLive(transcript);
        } catch {
          narrativeConsistency = baseJudge;
        }
      } else {
        narrativeConsistency = baseJudge;
      }
    }
    if (narrativeConsistency === null && judgeMode !== "live") {
      narrativeConsistency = judgeNarrativeConsistencyMock(transcript);
    }
  }

  // ⑪ 失败汇总
  const failures: string[] = [];
  if (terminatedReason === "error" || terminatedReason === "softlock" || terminatedReason === "invariant_failed") {
    failures.push(`terminated:${terminatedReason}`);
  }
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

  // ⑬ n-gram 重复率检测
  const repetitionResult = detectNarrativeRepetitions(
    steps.map((s) => ({ stepIndex: s.stepIndex, narrative: s.narrative }))
  );

  // ⑭ NPC 状态抖动检测
  const stateChurnResult = detectNpcStateChurn(
    steps.map((s, i) => ({
      stepIndex: s.stepIndex,
      stateAfter: s.stateAfter,
      prevState: i > 0 ? steps[i - 1]!.stateAfter : undefined,
    }))
  );

  // ⑮ 关系漂移检测
  const initialRelationships: Record<string, number> = {};
  const relationshipDriftResult = detectRelationshipDrift(
    steps.map((s) => ({ stepIndex: s.stepIndex, dmJson: s.dmJson })),
    initialRelationships
  );

  // ⑯ 构建 trace artifact
  const trace: TraceArtifact = {
    runId: transcript.runId,
    scenarioId: scenario.id,
    scenarioCategory: scenario.category,
    persona: personaType,
    seed,
    provenance: resolveExperimentProvenance({ seed }),
    startedAt: new Date(startTime).toISOString(),
    finishedAt: new Date(Date.now()).toISOString(),
    durationMs: transcript.durationMs,
    terminatedReason,
    totalSteps: transcript.totalSteps,
    initialState: transcript.initialState,
    invariantChecks: invariantResults.map((i) => ({
      stepIndex: i.stepIndex,
      passed: i.passed,
      violations: i.violations.map((v) => ({ rule: v.rule, severity: v.severity, description: v.description })),
    })),
    narrativeConsistency: narrativeConsistency ? {
      runId: transcript.runId,
      passed: narrativeConsistency.passed,
      overallScore: narrativeConsistency.overallScore,
      dimensionScores: narrativeConsistency.dimensionScores,
      issues: narrativeConsistency.issues.map((i) => ({ type: i.type, severity: i.severity, description: i.description })),
      reasoning: narrativeConsistency.reasoning,
      judgeMode: narrativeConsistency.judgeMode,
      judgeModel: narrativeConsistency.judgeModel,
      judgeLatencyMs: narrativeConsistency.judgeLatencyMs,
      judgeTokens: narrativeConsistency.judgeTokens,
      judgeConfidence: narrativeConsistency.judgeConfidence,
      judgeConfidenceSource: narrativeConsistency.judgeConfidenceSource,
      judgeError: narrativeConsistency.judgeError,
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
    narrativeRepetitionRate: repetitionResult.overallRepetitionRate,
    relationshipDriftCount: relationshipDriftResult.drifts.length,
    npcStateChurnCount: stateChurnResult.churns.length,
    failureContext: failureContext === null ? undefined : failureContext,
  };

  // ⑰ 写 trace artifact 落盘
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
      (!config.runNarrativeJudge || (narrativeConsistency?.passed ?? false)),
    failureContext: failureContext === null ? undefined : failureContext,
    failureSummary: failures,
    trace,
    scenarioId: scenario.id,
  };
}

function buildPlayerContext(state: GameStateSnapshot): string {
  return [
    `位置:${state.playerLocation}`,
    `HP:${state.hp}/${state.maxHp}`,
    `理智:${state.sanity}`,
    `职业:${state.profession ?? "无"}`,
    `武器:${state.equippedWeapon ?? "无"}`,
    `任务:${state.activeTaskIds.join(",") || "无"}`,
    `回合:${state.turnCount}`,
  ].join("；");
}

export function buildClientStructuredSnapshot(state: GameStateSnapshot): Record<string, unknown> {
  const bag = state.weaponBag ?? [];
  const equippedWeapon = state.equippedWeapon
    ? bag.find((weapon) => weapon.id === state.equippedWeapon) ?? {
        id: state.equippedWeapon,
        name: state.equippedWeapon,
        stability: state.weaponStability,
        contamination: state.weaponContamination,
        repairable: true,
      }
    : null;
  return {
    v: 1,
    turnIndex: state.turnCount,
    playerLocation: state.playerLocation,
    stats: { sanity: state.sanity, agility: 10, luck: 10, charm: 10, background: 10 },
    originium: state.originium,
    inventoryItemIds: state.inventoryItemIds,
    warehouseItemIds: state.warehouseItemIds ?? [],
    equippedWeapon,
    weaponBag: bag,
    currentProfession: state.profession,
    worldFlags: state.unlockedFlags,
    activeTaskIds: state.activeTaskIds,
    completedTaskIds: state.completedTaskIds,
    presentNpcIds: state.presentNpcIds,
    deadNpcIds: state.deadNpcIds,
    activeThreatIds: state.activeThreatIds,
    journalClueIds: state.journalClueIds,
    journalClueCount: state.journalClueIds?.length ?? 0,
  };
}

// === 批次编排（v3） ===

export async function runPlaythroughBatchV3(
  config: PlaythroughV3Config
): Promise<PlaythroughRunSummary & { failureClusters: FailureCluster[]; scenarioMap: Record<string, { id: string; category: ScenarioCategory; total: number; passed: number }>; traceArtifacts: string[] }> {
  const startTime = Date.now();

  // 场景过滤
  let scenarios = SCENARIOS;
  if (config.scenarioIds && config.scenarioIds.length > 0) {
    const requested = new Set(config.scenarioIds);
    scenarios = scenarios.filter((scenario) => requested.has(scenario.id));
    const found = new Set(scenarios.map((scenario) => scenario.id));
    const missing = config.scenarioIds.filter((id) => !found.has(id));
    if (missing.length > 0) throw new Error(`Unknown scenario ids: ${missing.join(", ")}`);
  }
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
    const requestedPersonas = config.personasByScenario?.[scenario.id] ?? config.personas;
    const selectedPersonas = scenario.personas.filter((persona) => requestedPersonas.includes(persona));
    for (const persona of selectedPersonas) {
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
          failureContext: result.failureContext,
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
  const sut = createSutAdapter({
    mock: config.mockMode,
    baseUrl: config.baseUrl,
    frameTimeoutMs: config.stepTimeoutMs,
  });
  const v3Config: PlaythroughV3Config = {
    ...config,
    traceOutputDir: undefined,
  };
  const result = await runSinglePlaythroughV3(v3Config, scenario, persona, runIndex, sut);
  if (sut.close) await sut.close();
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
  const allResults: PlaythroughRunResult[] = [];

  for (const persona of config.personas) {
    for (let i = 0; i < config.runsPerPersona; i++) {
      console.log(`  🎮 ${PERSONAS[persona]?.name ?? persona} #${i + 1}/${config.runsPerPersona}`);
      const result = await runSinglePlaythrough(config, persona, i);
      allResults.push(result);
    }
  }

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

/**
 * 供测试直接调用的 applyDmJsonToState 包装。
 * 用于验证 orchestrator 内部的状态转换逻辑是否正确。
 */
export const applyDmJsonToStateHelper = applyDmJsonToState;

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
