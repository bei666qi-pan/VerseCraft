#!/usr/bin/env tsx
/**
 * Live 小样本长程评测脚本
 *
 * Phase 5.2: ≤5 会话 × 15 回合真实模型跑通，产出 judge 评分 + 定性报告。
 *
 * 设计：
 * - 从场景库中精选 5 个场景，每个跑 15 回合
 * - 使用 HttpSutAdapter 调用真实 /api/chat（需运行 dev server）
 * - 使用 DeepSeek narrative judge 评分
 * - 产出评分 + 定性报告写入 docs/eval/
 *
 * 用法：
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts              # 默认 mock 模式
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --live        # 需要 dev server 运行中
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --base-url http://localhost:666
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --sessions 3  # 自定义会话数
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --out path    # 自定义报告路径
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --parallel 3     # 并发会话数（建议 2~4）
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --parallel 3 --continue-on-degrade  # 降级不中断会话，优先提升样本完整性
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --judge-mode codex # 无 API Key 时启用离线 Codex 裁判（默认 mock）
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --judge-mode live  # 强制使用 DeepSeek 裁判（需配置密钥）
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --judge-mode auto  # 自动：先用离线，若通过再尝试 live
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --step-delay-ms 500 # 缩短步间等待到 500ms
 *
 * 环境变量：
 *   PLAYTEST_LLM_API_KEY 或 DEEPSEEK_API_KEY — 叙事裁判需要（mock 模式跳过）
 *   LIVEPLAY_BASE_URL — 默认 http://localhost:666
 *   VERSECRAFT_EVAL_PARALLEL_SESSIONS — 并发会话数（默认 1）
 *   VERSECRAFT_EVAL_STEP_DELAY_MS — 步间延迟（默认 live 2000ms）
 *   VERSECRAFT_EVAL_CONTINUE_ON_DEGRADE — 1 则降级不中断会话，0 则降级 fail-fast
 */

import { applyDmJsonToState, buildClientStructuredSnapshot, createSutAdapter, SCENARIOS } from "../src/lib/evals/playthrough";
import type { PersonaType, PlaythroughTranscript, TerminatedReason, NarrativeConsistencyResult } from "../src/lib/evals/playthrough";
import type { RunFailureContext } from "../src/lib/evals/playthrough/types";
import {
  judgeNarrativeConsistencyMock,
  judgeNarrativeConsistencyLive,
  judgeNarrativeConsistencyCodex,
} from "../src/lib/evals/playthrough/narrativeJudge";
import { createInitialStateSnapshot } from "../src/lib/evals/playthrough/invariants";
import { generateMockAction } from "../src/lib/evals/playthrough/playerAgent";
import type { SutAction } from "../src/lib/evals/playthrough/sutAdapter";
import { classifyRunEvidence, resolveEvalExecutionMode } from "../src/lib/evals/productQuality/runOutcome";
import {
  requestClientOptionsRegenEvidence,
  shouldRequestClientOptionsRegen,
  type ClientOptionsRegenEvidence,
} from "../src/lib/evals/clientOptionsRegenEvidence";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// This CLI runs outside Next.js, so it must explicitly mirror the local
// development env load before it invokes the independent live judge.
for (const name of [".env", ".env.local"]) {
  const envPath = resolve(process.cwd(), name);
  if (existsSync(envPath)) loadEnv({ path: envPath, override: false, quiet: true });
}

// ─── CLI ────────────────────────────────────────────────

interface EvalCli {
  live: boolean;
  baseUrl: string;
  sessions: number;
  maxSteps: number;
  outDir: string;
  profile: "smoke" | "standard" | "deep";
  maxLiveCalls: number;
  scenarioIds?: string[];
  stepDelayMs: number;
  compareJudge: boolean;
  judgeMode: "auto" | "mock" | "live" | "codex";
  parallelism: number;
  continueOnDegrade: boolean;
}

type JudgePairReport = {
  hasLive: boolean;
  mockJudge: NarrativeConsistencyResult;
  liveJudge?: NarrativeConsistencyResult;
  scoreGap: number | null;
  passAgreement: boolean | null;
  criticalGap: number;
  majorGap: number;
};

function normalizeJudgeMode(value: string | undefined): EvalCli["judgeMode"] {
  if (value === "mock" || value === "live" || value === "codex" || value === "auto") {
    return value;
  }
  return "auto";
}

function hasJudgeCredentials(): boolean {
  return Boolean(process.env.PLAYTEST_LLM_API_KEY || process.env.DEEPSEEK_API_KEY);
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  if (["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.trim().toLowerCase())) return false;
  return undefined;
}

function parsePosInt(raw: string, fallback: number): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return value;
}

function parseArgs(): EvalCli {
  const args = process.argv.slice(2);
  const get = (name: string, def: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] ?? def : def;
  };
  const profileArg = get("--profile", "smoke");
  const profile = profileArg === "deep" || profileArg === "standard" ? profileArg : "smoke";
  const defaults = profile === "deep" ? { sessions: "5", steps: "30" } : profile === "standard" ? { sessions: "3", steps: "15" } : { sessions: "2", steps: "8" };
  return {
    live: args.includes("--live"),
    baseUrl: get("--base-url", process.env.LIVEPLAY_BASE_URL ?? "http://localhost:666"),
    sessions: parsePosInt(get("--sessions", defaults.sessions), Number(defaults.sessions)),
    maxSteps: parsePosInt(get("--max-steps", defaults.steps), Number(defaults.steps)),
    outDir: get("--out", "docs/eval"),
    profile,
    maxLiveCalls: parsePosInt(
      get("--max-live-calls", process.env.VERSECRAFT_EVAL_RUN_CALL_BUDGET ?? "60"),
      60,
    ),
    scenarioIds: get("--scenarios", "").split(",").map((id) => id.trim()).filter(Boolean),
    stepDelayMs: parsePosInt(
      get("--step-delay-ms", process.env.VERSECRAFT_EVAL_STEP_DELAY_MS ?? (args.includes("--live") ? "2000" : "0")),
      0,
    ),
    compareJudge: args.includes("--compare-judge") || process.env.VERSECRAFT_EVAL_COMPARE_JUDGE === "1",
    judgeMode: normalizeJudgeMode(get("--judge-mode", process.env.VERSECRAFT_EVAL_JUDGE_MODE ?? "auto")),
    parallelism: parsePosInt(get("--parallel", process.env.VERSECRAFT_EVAL_PARALLEL_SESSIONS ?? "1"), 1),
    continueOnDegrade:
      args.includes("--continue-on-degrade") ? true
        : args.includes("--stop-on-degrade") ? false
          : parseBooleanEnv(process.env.VERSECRAFT_EVAL_CONTINUE_ON_DEGRADE) ?? true,
  };
}

interface SessionSpec {
  scenarioId: string;
  persona: PersonaType;
  description: string;
  scriptedActions?: string[];
}

function buildFailureContext(args: {
  stepIndex: number;
  action: string;
  response: {
    status: string;
    aiStatus?: string;
    error?: string;
    dmJson: Record<string, unknown>;
    narrative: string;
  };
  mode: "step_error" | "step_degraded" | "step_degraded_after_retry" | "step_error_after_retry" | "run_stop";
}): RunFailureContext {
  const internalMeta = args.response.dmJson.internal_meta;
  const reasonRaw = internalMeta && typeof internalMeta === "object" && !Array.isArray(internalMeta)
    ? String((internalMeta as Record<string, unknown>)?.reason ?? "")
    : "";
  const reason = reasonRaw.trim().length > 0 ? reasonRaw : String(args.response.error ?? "unknown");
  const narrative = typeof args.response.narrative === "string" ? args.response.narrative : "";
  return {
    stepIndex: args.stepIndex,
    action: args.action,
    reason,
    transportStatus: args.response.status,
    aiStatus: args.response.aiStatus,
    hasVisibleNarrative: narrative.trim().length > 0,
    stepFailureMode: args.mode,
  };
}

function buildSessionPlan(requested: SessionSpec[], targetSessions: number): SessionSpec[] {
  if (requested.length === 0) return [];
  if (targetSessions <= requested.length) {
    return requested.slice(0, targetSessions);
  }

  const plan: SessionSpec[] = [];
  for (let i = 0; i < targetSessions; i += 1) {
    plan.push(requested[i % requested.length]!);
  }
  return plan;
}

function roundTo(n: number, digits = 2): string {
  return n.toFixed(digits);
}

function computePassRateInterval(
  passCount: number,
  total: number,
  confidenceLevel: number = 0.95,
): { rate: number; lower: number; upper: number } | null {
  if (total <= 0) return null;
  const p = passCount / total;
  const z = confidenceLevel === 0.99 ? 2.576 : 1.96;
  const se = Math.sqrt((p * (1 - p)) / total);
  const half = z * se;
  const lower = Math.max(0, p - half);
  const upper = Math.min(1, p + half);
  return { rate: p, lower, upper };
}

function estimateSamplesForHalfWidth(halfWidth: number, confidenceLevel: number = 0.95): number | null {
  if (halfWidth <= 0) return null;
  const z = confidenceLevel === 0.99 ? 2.576 : 1.96;
  const n = Math.ceil((z * z * 0.25) / (halfWidth * halfWidth));
  return Math.max(3, n);
}

async function runWithParallelism<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  worker: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const result: TOut[] = new Array(items.length);
  let cursor = 0;
  const limit = Math.max(1, concurrency);

  const runOne = async (): Promise<void> => {
    while (true) {
      const idx = cursor;
      if (idx >= items.length) return;
      cursor += 1;
      result[idx] = await worker(items[idx]!, idx);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return result;
}

// ─── 精选场景 ───────────────────────────────────────────

const SELECTED_SCENARIOS: Array<{
  scenarioId: string;
  persona: PersonaType;
  description: string;
  scriptedActions?: string[];
}> = [
  {
    scenarioId: "happy-speedrun",
    persona: "speedrunner",
    description: "速通主线流程",
    scriptedActions: [
      "先检查当前房间、门牌和手机信息，确认我所在的位置以及眼前真实存在的出口。",
      "沿三楼走廊前往楼梯间；如果道路受阻，明确说明阻碍来自哪里。",
      "通过楼梯下到一楼登记口，寻找已经登记在这个世界里的住户或管理员。",
      "向当前在场且确实存在的 NPC 询问离开公寓所需的条件，不接受凭空出现的新人物。",
      "根据已经取得的线索检查可通行出口，并验证出口是否属于假逃生路线。",
      "选择目前证据最充分的逃生方案执行；如果前置条件不足，列明缺少的结构化条件。",
    ],
  },
  {
    scenarioId: "happy-explore",
    persona: "explorer",
    description: "探索分支路径",
    scriptedActions: undefined,
  },
  {
    scenarioId: "refusal-prompt-injection",
    persona: "rulebreaker",
    description: "对抗 prompt injection",
    scriptedActions: undefined,
  },
  {
    scenarioId: "recovery-low-hp",
    persona: "speedrunner",
    description: "HP 临界恢复",
    scriptedActions: undefined,
  },
  {
    scenarioId: "abandonment-confused-30s",
    persona: "confused",
    description: "迷茫玩家行为",
    scriptedActions: undefined,
  },
];

// ─── 简化单局运行（不依赖完整 orchestrator，直接 SUT 调用）────

async function runSession(
  sessionIndex: number,
  selected: SessionSpec,
  config: EvalCli
): Promise<{
  sessionIndex: number;
  scenarioId: string;
  persona: PersonaType;
  steps: Array<{ step: number; action: string; narrative: string; latencyMs: number }>;
  judgeResult: NarrativeConsistencyResult;
  terminatedReason: string;
  totalSteps: number;
  durationMs: number;
  degradedSteps: number;
  judgeMode: "live" | "mock" | "codex" | "fallback";
  executionMode: "mock_full" | "live_full" | "live_degraded";
  initialState: PlaythroughTranscript["initialState"];
  gameplayGate: { passed: boolean; required: string[]; forbidden: string[]; observed: Record<string, number>; missing: string[]; forbiddenObserved: string[] };
  judgePair?: JudgePairReport;
  failureContext?: RunFailureContext;
}> {
  const startTime = Date.now();
  const scenario = SCENARIOS.find((s) => s.id === selected.scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${selected.scenarioId}`);

  console.log(`\n  🔄 Session ${sessionIndex + 1}/${config.sessions}: ${selected.scenarioId} [${selected.persona}]`);

  // 创建 SUT
  const sut = createSutAdapter({
    mock: !config.live,
    baseUrl: config.baseUrl,
    sessionId: `live-eval-${Date.now()}-${sessionIndex}`,
    frameTimeoutMs: 60000,
  });

  // 初始状态
  const initialState = createInitialStateSnapshot(scenario.initialStateOverride as Record<string, unknown> | undefined);
  let currentState = { ...initialState };
  const steps: Array<{ step: number; action: string; narrative: string; latencyMs: number; dmJson: Record<string, unknown>; stateAfter: typeof currentState; status: string; aiStatus?: string; clientOptionRegeneration?: ClientOptionsRegenEvidence }> = [];
  let terminatedReason: TerminatedReason = "max_steps";
  let totalSteps = 0;
  let degradedSteps = 0;
  let failureContext: RunFailureContext | null = null;

  try {
    for (let step = 0; step < config.maxSteps; step++) {
      // 玩家动作
      const action = selected.scriptedActions?.[step]
        ?? generateMockAction(selected.persona, step, 42 + sessionIndex);

      // SUT 调用
      const response = await sut.step({
        playerAction: action,
        persona: selected.persona,
        stepIndex: step,
        playerContext: `位置:${currentState.playerLocation}；HP:${currentState.hp}/${currentState.maxHp}；理智:${currentState.sanity}；任务:${currentState.activeTaskIds.join(",") || "无"}；图鉴:${currentState.codexNpcIds.join(",") || "无"}；回合:${currentState.turnCount}`,
        clientState: buildClientStructuredSnapshot(currentState),
      } as SutAction);

      if (response.status === "error" && !response.reachedFinal) {
        console.warn(`    ⚠️ Step ${step} 失败: ${response.error ?? "unknown"}`);
        if (config.live) degradedSteps++;
        if (!failureContext) {
          failureContext = buildFailureContext({
            stepIndex: step,
            action,
            response,
            mode: "step_error",
          });
        }
        terminatedReason = "error";
        totalSteps = step;
        break;
      }
      if (response.status === "degraded" || response.aiStatus) degradedSteps++;
      if (failureContext === null && (response.status === "degraded" || response.aiStatus)) {
        failureContext = buildFailureContext({
          stepIndex: step,
          action,
          response,
          mode: response.status === "error" ? "step_error" : "step_degraded",
        });
      }
      currentState = applyDmJsonToState(currentState, response.dmJson, response.narrative);

      const mainOptions = Array.isArray(response.dmJson.options)
        ? response.dmJson.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0)
        : [];
      // The main turn remains the only state authority. This follows the
      // browser's options-only repair policy strictly for player-visible
      // choices and records every outcome instead of inventing options.
      const clientOptionRegeneration = shouldRequestClientOptionsRegen(mainOptions)
        ? await requestClientOptionsRegenEvidence({
            baseUrl: config.baseUrl,
            sessionId: `live-eval-${sessionIndex}`,
            playerAction: action,
            narrative: response.narrative,
            state: currentState,
            currentOptions: mainOptions,
          })
        : undefined;

      steps.push({
        step,
        action,
        narrative: response.narrative,
        latencyMs: response.latencyMs,
        dmJson: response.dmJson,
        stateAfter: { ...currentState },
        status: response.status,
        aiStatus: response.aiStatus,
        clientOptionRegeneration,
      });

      // 在默认策略下不因为降级而中断会话，继续收集后续回合的证据（用于统计置信）。
      // 仅当显式要求停顿时，才执行止损。
      if (response.status === "degraded" && !config.continueOnDegrade) {
        terminatedReason = "error";
        failureContext = buildFailureContext({
          stepIndex: step,
          action,
          response,
          mode: "run_stop",
        });
        totalSteps = step + 1;
        break;
      }

      // 检查终止条件
      if (response.dmJson["is_death"] === true) {
        terminatedReason = "death";
        totalSteps = step + 1;
        break;
      }
      if (response.dmJson["reached_ending"] === true || response.dmJson["is_ending"] === true) {
        terminatedReason = "reached_ending";
        totalSteps = step + 1;
        break;
      }

      totalSteps = step + 1;
      if ((step + 1) % 5 === 0) {
        console.log(`    Step ${step + 1}/${config.maxSteps} ... (${response.latencyMs}ms)`);
      }
      if (config.live && config.stepDelayMs > 0 && step + 1 < config.maxSteps) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, config.stepDelayMs));
      }
    }
  } finally {
    await sut.close?.();
  }

  const durationMs = Date.now() - startTime;

  // 叙事裁判
  const transcript: PlaythroughTranscript = {
    runId: `live-${selected.scenarioId}-${selected.persona}-session${sessionIndex}`,
    persona: selected.persona,
    seed: sessionIndex,
    steps: steps.map((s) => ({
      stepIndex: s.step,
      playerAction: s.action,
      narrative: s.narrative,
      dmJson: s.dmJson,
      stateAfter: s.stateAfter,
      timestamp: Date.now(),
    })),
    initialState,
    finalState: currentState,
    terminatedReason,
    totalSteps,
    durationMs,
  };

  const baselineJudge = config.judgeMode === "codex"
    ? await judgeNarrativeConsistencyCodex(transcript)
    : judgeNarrativeConsistencyMock(transcript);
  const observed = {
    tasks: steps.filter((step) => Array.isArray(step.dmJson.task_updates) && step.dmJson.task_updates.some((raw) => raw && typeof raw === "object" && !Array.isArray(raw) && ["active", "completed"].includes(String((raw as Record<string, unknown>).status ?? "")))).length,
    codex: steps.filter((step) => Array.isArray(step.dmJson.codex_updates) && step.dmJson.codex_updates.length > 0).length,
    location: steps.filter((step, index) => {
      const before = index === 0 ? initialState.playerLocation : steps[index - 1]!.stateAfter.playerLocation;
      return typeof step.dmJson.player_location === "string" && step.dmJson.player_location.trim().length > 0 && step.dmJson.player_location !== before;
    }).length,
    weapons: steps.filter((step) => ["weapon_updates", "weapon_bag_updates"].some((key) => Array.isArray(step.dmJson[key]) && (step.dmJson[key] as unknown[]).length > 0)).length,
    combat: steps.filter((step) => step.dmJson.conflict_outcome != null || (Array.isArray(step.dmJson.main_threat_updates) && step.dmJson.main_threat_updates.length > 0)).length,
    economy: steps.filter((step) => typeof step.dmJson.currency_change === "number" && step.dmJson.currency_change !== 0).length,
    profession: steps.filter((step) => step.dmJson.profession_trial_result != null || typeof step.dmJson.profession === "string").length,
    ending: steps.filter((step) => step.dmJson.ending_finale != null || step.dmJson.reached_ending === true || step.dmJson.is_ending === true).length,
  };
  const required = scenario.requiredFeatureOutcomes ?? [];
  const forbidden = scenario.forbiddenFeatureOutcomes ?? [];
  const missing = required.filter((id) => observed[id] === 0);
  for (const taskId of scenario.requiredCompletedTaskIds ?? []) {
    if (!currentState.completedTaskIds.includes(taskId)) missing.push(`completed_task:${taskId}`);
  }
  if (scenario.requiredFinalLocation && currentState.playerLocation !== scenario.requiredFinalLocation) {
    missing.push(`final_location:${scenario.requiredFinalLocation}`);
  }
  const forbiddenObserved = forbidden.filter((id) => observed[id] > 0);
  const gameplayGate = { passed: missing.length === 0 && forbiddenObserved.length === 0, required, forbidden, observed, missing, forbiddenObserved };
  let judgeResult: NarrativeConsistencyResult;
  const judgePair: JudgePairReport = {
    mockJudge: baselineJudge,
    hasLive: false,
    scoreGap: null,
    passAgreement: null,
    criticalGap: 0,
    majorGap: 0,
  };
  let judgeMode: "live" | "mock" | "codex" | "fallback" = config.judgeMode === "codex" ? "codex" : "mock";
  const forceLiveJudge = process.env.VERSECRAFT_EVAL_FORCE_LIVE_JUDGE === "1";
  const shouldUseLiveJudge =
    (config.judgeMode === "live")
    || (config.judgeMode === "auto" && (baselineJudge.passed || forceLiveJudge));
  const shouldCompareJudges = config.compareJudge;
  const canRunLiveJudge = config.live && hasJudgeCredentials() && degradedSteps === 0;

  const runLiveJudge = async (): Promise<NarrativeConsistencyResult | null> => {
    if (!canRunLiveJudge) return null;
    try {
      return await judgeNarrativeConsistencyLive(transcript);
    } catch {
      return null;
    }
  };

  if (canRunLiveJudge && shouldUseLiveJudge) {
    const liveJudge = await runLiveJudge();
    if (liveJudge) {
      judgeResult = liveJudge;
      judgePair.hasLive = true;
      judgePair.liveJudge = liveJudge;
      judgeMode = "live";
    } else {
      judgeResult = baselineJudge;
      judgeMode = "fallback";
    }
  } else {
    judgeResult = baselineJudge;
  }

  if (shouldCompareJudges && canRunLiveJudge && !judgePair.hasLive) {
    const liveJudge = await runLiveJudge();
    if (liveJudge) {
      judgePair.hasLive = true;
      judgePair.liveJudge = liveJudge;
    }
  }

  if (judgePair.hasLive && judgePair.liveJudge) {
    judgePair.scoreGap = Math.abs(baselineJudge.overallScore - judgePair.liveJudge.overallScore);
    judgePair.criticalGap = Math.abs(
      baselineJudge.issues.filter((issue) => issue.severity === "critical").length
      - judgePair.liveJudge.issues.filter((issue) => issue.severity === "critical").length,
    );
    judgePair.majorGap = Math.abs(
      baselineJudge.issues.filter((issue) => issue.severity === "major").length
      - judgePair.liveJudge.issues.filter((issue) => issue.severity === "major").length,
    );
    judgePair.passAgreement = baselineJudge.passed === judgePair.liveJudge.passed;
  }

  return {
    sessionIndex,
    scenarioId: selected.scenarioId,
    persona: selected.persona,
    steps,
    judgeResult,
    terminatedReason,
    totalSteps,
    durationMs,
    degradedSteps,
    judgeMode,
    executionMode: resolveEvalExecutionMode({ live: config.live, degradedSteps, terminatedReason }),
    initialState,
    gameplayGate,
    judgePair: shouldCompareJudges ? judgePair : undefined,
    failureContext: failureContext ?? undefined,
  };
}

// ─── 报告生成 ───────────────────────────────────────────

function generateReport(
  results: Awaited<ReturnType<typeof runSession>>[],
  config: EvalCli
): string {
  const statusFor = (result: Awaited<ReturnType<typeof runSession>>) => {
    // 真实回放中，只有已完成的 live judge 才能构成模型质量证据；mock/codex/fallback
    // 都不能把 baseline 分数包装成真实可玩性结论。
    if (config.live && result.judgeMode !== "live") return "inconclusive" as const;
    return classifyRunEvidence({
      executionMode: result.executionMode,
      terminatedReason: result.terminatedReason,
      judgePassed: result.judgeResult.passed,
      gameplayGatePassed: result.gameplayGate.passed,
      executedSteps: result.totalSteps,
      plannedScenarioSteps: SCENARIOS.find((scenario) => scenario.id === result.scenarioId)?.scriptedActions?.length ?? config.maxSteps,
    });
  };
  const totalSteps = results.reduce((s, r) => s + r.totalSteps, 0);
  const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);
  const denominator = Math.max(1, results.length);
  const trustedJudgeResults = results.filter((result) => !config.live || result.judgeMode === "live");
  const avgJudgeScore = trustedJudgeResults.length > 0
    ? trustedJudgeResults.reduce((sum, result) => sum + result.judgeResult.overallScore, 0) / trustedJudgeResults.length
    : null;
  const passedSessions = results.filter((r) => statusFor(r) === "pass").length;
  const conclusiveSessions = results.filter((r) => statusFor(r) !== "inconclusive").length;
  const inconclusiveSessions = results.length - conclusiveSessions;
  const pairedComparisons = results.filter((r) => r.judgePair?.hasLive).length;
  const passAgreementRate = pairedComparisons > 0
    ? results.reduce((s, r) => s + (r.judgePair?.passAgreement === true ? 1 : 0), 0) / pairedComparisons
    : null;
  const avgScoreGap = pairedComparisons > 0
    ? results.reduce((s, r) => s + (r.judgePair?.scoreGap ?? 0), 0) / pairedComparisons
    : null;
  const disagreementCases = results.filter((r) => r.judgePair?.passAgreement === false);
  const highGapCases = results.filter((r) => r.judgePair && (r.judgePair.scoreGap ?? 0) >= 0.5);

  const lines: string[] = [];

  lines.push("# Live Playthrough 小样本长程评测报告");
  lines.push("");
  lines.push(`> **生成时间**: ${new Date().toISOString()}`);
  lines.push(`> **模式**: ${config.live ? "live (真实 SUT)" : "mock (规则模拟)"}`);
  lines.push(`> **会话数**: ${results.length}`);
  lines.push(`> **总回合数**: ${totalSteps}`);
  lines.push(`> **总耗时**: ${(totalDuration / 1000).toFixed(1)}s`);
  lines.push(`> **执行配方**: ${[...new Set(results.map((r) => r.executionMode))].join(", ")}`);
  lines.push(`> **成本档位**: ${config.profile}`);
  lines.push(`> **Judge 对账**: ${pairedComparisons}/${results.length} 会话有 mock↔live 双判`);
  if (passAgreementRate !== null) {
    lines.push(`> **Pass 对齐率**: ${(passAgreementRate * 100).toFixed(1)}%`);
  }
  if (avgScoreGap !== null) {
    lines.push(`> **平均分差**: ${avgScoreGap.toFixed(2)}`);
  }
  lines.push("");
  lines.push("## 综合评分");
  lines.push("");
  lines.push(`| 指标 | 值 |`);
  lines.push(`|---|---|`);
  lines.push(`| 平均叙事分 | ${avgJudgeScore === null ? "N/A（无 live judge 证据）" : `${avgJudgeScore.toFixed(2)}/5`} |`);
  lines.push(`| 通过会话 | ${passedSessions}/${conclusiveSessions} 个有结论会话 |`);
  lines.push(`| 未完成专项 | ${inconclusiveSessions} |`);
  lines.push(`| 平均回合数 | ${(totalSteps / denominator).toFixed(1)} |`);
  lines.push(`| 平均会话耗时 | ${(totalDuration / denominator / 1000).toFixed(1)}s |`);
  lines.push("");

  const confidence = computePassRateInterval(passedSessions, conclusiveSessions);
  if (confidence) {
    const recommendSamples = confidence.upper - confidence.lower > 0.35
      ? estimateSamplesForHalfWidth(0.05)
      : null;
    lines.push("### 统计置信度（通过会话）");
    lines.push("");
    lines.push(`- 通过率：${(confidence.rate * 100).toFixed(1)}%`);
    lines.push(`- 95% 置信区间：${(confidence.lower * 100).toFixed(1)}% ~ ${(confidence.upper * 100).toFixed(1)}%`);
    lines.push(`- 区间宽度：${roundTo((confidence.upper - confidence.lower) * 100, 1)}pp`);
    if (confidence.upper - confidence.lower > 0.35) {
      lines.push("- ⚠️ 置信区间较宽，建议至少增加 2~4 个会话再复评。");
      if (recommendSamples !== null) {
        lines.push(`- 建议总样本数至少到 ${recommendSamples} 会话（95% 下单侧半宽约 5%）。`);
      }
    }
    lines.push("");
  } else {
    lines.push("- 当前样本不足，无法做通过率置信区间。");
    lines.push("");
  }

  // 维度分聚合
  const dims = ["coherence", "characterVoice", "plotLogic", "immersion", "factConsistency"];
  lines.push("### 维度平均分");
  lines.push("");
  lines.push(`| 维度 | 平均分 |`);
  lines.push(`|---|---|`);
  for (const dim of dims) {
    const avg = trustedJudgeResults.length > 0
      ? trustedJudgeResults.reduce((sum, result) => sum + (result.judgeResult.dimensionScores[dim] ?? 0), 0) / trustedJudgeResults.length
      : null;
    lines.push(`| ${dim} | ${avg === null ? "N/A" : avg.toFixed(2)} |`);
  }
  lines.push("");

  if (pairedComparisons > 0) {
    lines.push("### mock/live 对账");
    lines.push("");
    lines.push(`- 对账会话数: ${pairedComparisons}`);
    lines.push(`- Pass 对齐率: ${((passAgreementRate ?? 0) * 100).toFixed(1)}%`);
    lines.push(`- 平均分差: ${(avgScoreGap ?? 0).toFixed(2)}（0 表示一致）`);
    lines.push(`- Pass 不一致会话: ${disagreementCases.length} 个`);
    lines.push(`- 大分差会话（≥0.5）: ${highGapCases.length} 个`);
    lines.push("");
    if (disagreementCases.length > 0) {
      lines.push("#### Pass 不一致样本");
      lines.push("");
      for (const r of disagreementCases) {
        const pair = r.judgePair!;
        lines.push(`- Session ${r.sessionIndex + 1} ${r.scenarioId}: mock=${pair.mockJudge.passed ? "pass" : "fail"}，live=${pair.liveJudge?.passed ? "pass" : "fail"}，分差=${(pair.scoreGap ?? 0).toFixed(2)}`);
      }
      lines.push("");
    }
  }

  // 逐会话详情
  lines.push("## 逐会话详情");
  lines.push("");
  for (const r of results) {
    const evidenceStatus = statusFor(r);
    const icon = evidenceStatus === "pass" ? "✅" : evidenceStatus === "fail" ? "❌" : "⚪";
    lines.push(`### ${icon} Session ${r.sessionIndex + 1}: ${r.scenarioId} [${r.persona}]`);
    lines.push("");
    lines.push(`- **终止原因**: ${r.terminatedReason}`);
    lines.push(`- **总回合数**: ${r.totalSteps}`);
    lines.push(`- **耗时**: ${(r.durationMs / 1000).toFixed(1)}s`);
    lines.push(`- **叙事评分**: ${r.judgeResult.overallScore}/5`);
    lines.push(`- **执行模式**: ${r.executionMode}（降级 ${r.degradedSteps} 回合）`);
    lines.push(`- **裁判模式**: ${r.judgeMode}`);
    if (r.judgePair?.hasLive && r.judgePair.liveJudge) {
      const pair = r.judgePair;
      lines.push(`- **mock/live 对账**: mock=${pair.mockJudge.overallScore}/5, live=${pair.liveJudge.overallScore}/5, pass一致=${pair.passAgreement === null ? "na" : pair.passAgreement ? "是" : "否"}, 分差=${(pair.scoreGap ?? 0).toFixed(2)}`);
    }
    lines.push(`- **证据状态**: ${evidenceStatus}`);
    lines.push(`- **玩法结果门禁**: ${r.gameplayGate.passed ? "通过" : evidenceStatus === "inconclusive" ? `未完成（预算截断；尚缺 ${r.gameplayGate.missing.join(", ")}）` : `失败（缺少 ${r.gameplayGate.missing.join(", ")}）`}；observed=${JSON.stringify(r.gameplayGate.observed)}`);
    lines.push(`- **维度分**: ${JSON.stringify(r.judgeResult.dimensionScores)}`);
    lines.push("");
    lines.push(`#### 问题列表`);
    for (const issue of r.judgeResult.issues) {
      const sevIcon = issue.severity === "critical" ? "🔴" : issue.severity === "major" ? "🟡" : "🟢";
      lines.push(`- ${sevIcon} [${issue.severity}] ${issue.description}`);
    }
    if (r.judgeResult.issues.length === 0) {
      lines.push("- 无问题");
    }
    lines.push("");
    lines.push(`#### 裁判推理`);
    lines.push(`> ${r.judgeResult.reasoning}`);
    lines.push("");

    // 回合摘要
    lines.push(`#### 回合记录`);
    lines.push("");
    for (const step of r.steps.slice(0, 15)) {
      const narrativePreview = step.narrative.length > 80
        ? step.narrative.slice(0, 80) + "..."
        : step.narrative;
      lines.push(`- **Step ${step.step + 1}** (${step.latencyMs}ms): "${step.action}" → "${narrativePreview}"`);
    }
    if (r.steps.length > 15) {
      lines.push(`- ... 还有 ${r.steps.length - 15} 回合`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // 定性发现
  lines.push("## 定性发现");
  lines.push("");
  const allIssues = results.flatMap((r) => r.judgeResult.issues);
  const criticalIssues = allIssues.filter((i) => i.severity === "critical");
  const majorIssues = allIssues.filter((i) => i.severity === "major");

  if (criticalIssues.length > 0) {
    lines.push("### 🔴 Critical 问题");
    lines.push("");
    for (const issue of criticalIssues) {
      lines.push(`- ${issue.description}`);
    }
    lines.push("");
  }

  if (majorIssues.length > 0) {
    lines.push("### 🟡 Major 问题");
    lines.push("");
    const uniqueMajor = [...new Set(majorIssues.map((i) => i.description))];
    for (const desc of uniqueMajor) {
      lines.push(`- ${desc}`);
    }
    lines.push("");
  }

  // 稳定性评估
  const avgLatency = results.flatMap((r) => r.steps.map((s) => s.latencyMs));
  const p50Latency = avgLatency.sort((a, b) => a - b)[Math.floor(avgLatency.length * 0.5)] ?? 0;
  const p95Latency = avgLatency.sort((a, b) => a - b)[Math.floor(avgLatency.length * 0.95)] ?? 0;

  lines.push("### 性能统计");
  lines.push("");
  lines.push(`| 指标 | 值 |`);
  lines.push(`|---|---|`);
  lines.push(`| 平均单步延迟 | ${(avgLatency.reduce((s, v) => s + v, 0) / avgLatency.length).toFixed(0)}ms |`);
  lines.push(`| p50 延迟 | ${p50Latency}ms |`);
  lines.push(`| p95 延迟 | ${p95Latency}ms |`);
  lines.push(`| 终止原因分布 | ${results.map((r) => r.terminatedReason).join(", ")} |`);
  lines.push("");

  // 结论
  lines.push("## 结论与建议");
  lines.push("");
  if (passedSessions === results.length) {
    lines.push("✅ 所有会话通过叙事一致性检查。");
  } else {
    lines.push(`⚠️ ${results.length - passedSessions}/${results.length} 个会话存在叙事一致性问题。`);
  }
  if (criticalIssues.length > 0) {
    lines.push(`🔴 发现 ${criticalIssues.length} 个 Critical 问题，建议优先修复。`);
  }
  if (avgJudgeScore === null) {
    lines.push("⚪ 当前没有可用于真实质量结论的 live judge 证据；请运行 model narrative review 或配置 live judge。");
  } else if (avgJudgeScore < 3) {
    lines.push("⚠️ 平均叙事分低于 3/5，整体叙事质量需改善。");
  } else if (avgJudgeScore < 4) {
    lines.push("📈 平均叙事分在 3-4 区间，有提升空间。");
  } else {
    lines.push("✅ 平均叙事分达到 4+，叙事质量良好。");
  }
  lines.push("");

  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();
  const estimatedDmCalls = config.sessions * config.maxSteps;

  if (config.live && estimatedDmCalls > config.maxLiveCalls) {
    throw new Error(
      `预计 ${estimatedDmCalls} 次 live DM 调用，超过单次预算 ${config.maxLiveCalls}。` +
      `请降低 --sessions/--max-steps，或显式设置 --max-live-calls。`,
    );
  }

  console.log("📊 Live Playthrough 小样本长程评测");
  console.log("═".repeat(60));
  console.log(`模式: ${config.live ? "live (真实 SUT)" : "mock (规则模拟)"}`);
  console.log(`裁判模式: ${config.judgeMode}`);
  console.log(`成本档位: ${config.profile}`);
  console.log(`预计 DM 调用: ${estimatedDmCalls}/${config.maxLiveCalls}`);
  console.log(`会话数: ${config.sessions} (每会话 ${config.maxSteps} 回合)`);
  console.log(`报告输出: ${config.outDir}`);
  if (config.live) console.log(`SUT base URL: ${config.baseUrl}`);
  if (!config.live) console.log("提示: 用 --live 启用真实 SUT（需要 dev server）");
  if (config.compareJudge) {
    console.log("🧪 已开启 judge 对账：mock 与 live 双判（每会话最多增加一次 live 调用）。");
    if (!hasJudgeCredentials()) {
      console.log("⚠️  未设置 PLAYTEST_LLM_API_KEY/DEEPSEEK_API_KEY，无法执行 live judge 对账。");
    }
  }
  console.log("");

  if (!hasJudgeCredentials() && (config.judgeMode === "live" || config.compareJudge)) {
    console.log("⚠️  PLAYTEST_LLM_API_KEY / DEEPSEEK_API_KEY 未设置，当前会话无法执行 live judge。");
    console.log("   设置环境变量以启用真实 LLM 裁判评分。");
    console.log("   当前脚本兼容 PLAYTEST_LLM_API_KEY 和 DEEPSEEK_API_KEY。");
    console.log("");
  }
  if (config.judgeMode === "codex") {
    console.log("ℹ️  当前使用离线 Codex 裁判，不需要 LLM API Key。");
    console.log("");
  }

  // 选择会话
  const requestedScenarios = config.scenarioIds && config.scenarioIds.length > 0
    ? config.scenarioIds.map((id): SessionSpec => {
      const scenario = SCENARIOS.find((candidate) => candidate.id === id);
      if (!scenario) throw new Error(`Unknown scenario: ${id}`);
      return {
        scenarioId: scenario.id,
        persona: scenario.personas[0] ?? "explorer" as PersonaType,
        description: scenario.description,
        scriptedActions: scenario.scriptedActions,
      };
    })
    : SELECTED_SCENARIOS;
  const sessions = buildSessionPlan(requestedScenarios, config.sessions);
  console.log(`精选场景: ${sessions.map((s) => s.scenarioId).join(", ")}`);
  if (sessions.length > 0 && config.parallelism > 1) {
    console.log(`并发会话数: ${config.parallelism}`);
  }
  if (!config.continueOnDegrade) {
    console.log("🧪 降级策略: 发现降级则中止当前会话，符合平台级 fail-fast 策略。");
  } else {
    console.log("🧪 降级策略: 记录降级后继续运行后续回合，优先提高样本完整性。");
  }

  // Every execution gets a distinct evidence identity. Scenario/index-only IDs
  // collapse genuine reruns and make bug-ledger run counts untrustworthy.
  const executionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // 运行
  const results: Awaited<ReturnType<typeof runSession>>[] = [];
  const tracesDir = resolve(config.outDir, "traces");
  mkdirSync(tracesDir, { recursive: true });
  const runItems = sessions.map((session, index) => ({ session, index }));

  const runResults = await runWithParallelism(
    runItems,
    config.parallelism,
    async ({ session, index }) => {
      try {
        const result = await runSession(index, session, config);
        const traceSteps = result.steps.map((step) => {
          const evalMetrics = step.dmJson._eval_metrics;
          const usage = evalMetrics && typeof evalMetrics === "object" && !Array.isArray(evalMetrics)
            ? evalMetrics as Record<string, unknown>
            : {};
          return {
            stepIndex: step.step,
            playerAction: step.action,
            narrative: step.narrative,
            stateSnapshot: step.stateAfter,
            dmJson: step.dmJson,
            ...(step.clientOptionRegeneration
              ? { clientOptionRegeneration: step.clientOptionRegeneration }
              : {}),
            metrics: {
              latencyMs: step.latencyMs,
              ...(typeof usage.input_tokens === "number" ? { inputTokens: usage.input_tokens } : {}),
              ...(typeof usage.output_tokens === "number" ? { outputTokens: usage.output_tokens } : {}),
              ...(typeof usage.cached_input_tokens === "number" ? { cachedInputTokens: usage.cached_input_tokens } : {}),
            },
            transport: { status: step.status, aiStatus: step.aiStatus ?? null },
          };
        });
        const evidenceStatus = config.live && result.judgeMode !== "live" ? "inconclusive" : classifyRunEvidence({
          executionMode: result.executionMode,
          terminatedReason: result.terminatedReason,
          judgePassed: result.judgeResult.passed,
          gameplayGatePassed: result.gameplayGate.passed,
          executedSteps: result.totalSteps,
          plannedScenarioSteps: session.scriptedActions?.length ?? config.maxSteps,
        });
        writeFileSync(resolve(tracesDir, `${result.scenarioId}-${result.persona}-${index}.json`), JSON.stringify({
          runId: `live-${result.scenarioId}-${executionId}-${index}`,
          scenarioId: result.scenarioId,
          persona: result.persona,
          initialState: result.initialState,
          steps: traceSteps,
          terminatedReason: result.terminatedReason,
          narrativeConsistency: result.judgeResult,
          judgeComparison: result.judgePair ? {
            mockOverall: result.judgePair.mockJudge.overallScore,
            mockPassed: result.judgePair.mockJudge.passed,
            liveAvailable: result.judgePair.hasLive,
            liveOverall: result.judgePair.liveJudge?.overallScore ?? null,
            livePassed: result.judgePair.liveJudge?.passed ?? null,
            passAgreement: result.judgePair.passAgreement,
            scoreGap: result.judgePair.scoreGap,
            criticalGap: result.judgePair.criticalGap,
            majorGap: result.judgePair.majorGap,
          } : null,
          gameplayGate: result.gameplayGate,
          narrativeRepetitionRate: null,
          evidenceStatus,
          failureTags: evidenceStatus === "fail" ? ["quality_or_execution_failed"] : [],
          executionMode: result.executionMode,
          judgeMode: result.judgeMode,
          failureContext: result.failureContext,
        }, null, 2), "utf8");
        return result;
      } catch (err) {
        console.error(`  ❌ Session ${index + 1} 执行异常: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
  );

  for (const runResult of runResults) {
    if (runResult) {
      results.push(runResult);
    }
  }

  // 生成报告
  const report = generateReport(results, config);

  // 写入文件
  if (!existsSync(config.outDir)) {
    mkdirSync(config.outDir, { recursive: true });
  }
  const reportPath = resolve(config.outDir, "live-playthrough-report.md");
  writeFileSync(reportPath, report, "utf8");
  console.log(`\n📄 报告已写入: ${reportPath}`);

  // 摘要
  console.log("\n📊 评测摘要");
  console.log("═".repeat(60));
  for (const r of results) {
    const evidenceStatus = config.live && r.judgeMode !== "live" ? "inconclusive" : classifyRunEvidence({
      executionMode: r.executionMode,
      terminatedReason: r.terminatedReason,
      judgePassed: r.judgeResult.passed,
      gameplayGatePassed: r.gameplayGate.passed,
      executedSteps: r.totalSteps,
      plannedScenarioSteps: SCENARIOS.find((scenario) => scenario.id === r.scenarioId)?.scriptedActions?.length ?? config.maxSteps,
    });
    const score = r.executionMode === "live_degraded"
      ? "N/A (degraded)"
      : config.live && r.judgeMode !== "live"
        ? "N/A (no live judge evidence)"
        : `${r.judgeResult.overallScore}/5`;
    const icon = evidenceStatus === "pass" ? "✅" : evidenceStatus === "fail" ? "❌" : "⚪";
    console.log(`  ${icon} ${r.scenarioId} [${r.persona}]: ${score}, ${r.totalSteps} 回合, ${(r.durationMs / 1000).toFixed(1)}s, ${evidenceStatus}`);
  }
  const scoreableResults = results.filter((r) => r.executionMode !== "live_degraded" && (!config.live || r.judgeMode === "live"));
  const avgScore = scoreableResults.reduce((s, r) => s + r.judgeResult.overallScore, 0) / scoreableResults.length;
  console.log(`  平均叙事分: ${scoreableResults.length > 0 ? `${avgScore.toFixed(2)}/5` : "N/A (无可评分 live 输出)"}`);

  if (!config.live) {
    console.log("\n⏱️  提示：mock 模式不调真实 SUT。使用 --live 运行真实 /api/chat 评测。");
    console.log("   先确保 dev server 在运行：pnpm dev");
  }
}

// A pending fetch/readable-stream promise is not always enough to keep a
// standalone tsx process alive (notably when the underlying socket is
// unref'ed). Keep this evidence runner alive until it has either written its
// report or surfaced the actual transport failure; a partial live run must
// never disappear as a successful empty invocation.
const mainLiveness = setInterval(() => undefined, 1_000);
main()
  .catch((err) => {
    console.error("❌ 评测脚本失败:", err);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(mainLiveness));
