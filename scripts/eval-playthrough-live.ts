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
 * - 产出评分 + 定性报告写入隔离的 .runtime-data/eval/<run-id>/
 *
 * 用法：
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts              # 默认 mock 模式
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --live        # 需要 dev server 运行中
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --base-url http://localhost:666
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --sessions 3  # 自定义会话数
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --out path    # 自定义报告路径
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --parallel 3     # 并发会话数（建议 2~4）
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --live --action-mode live # 全程由真实玩家 AI 决策，忽略场景脚本
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --live --action-mode hybrid # 场景脚本结束后交给玩家 AI
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
import { generateMockAction, PERSONAS } from "../src/lib/evals/playthrough/playerAgent";
import type { SutAction } from "../src/lib/evals/playthrough/sutAdapter";
import { generatePlayerActionDeepSeek } from "../src/lib/evals/liveProvider";
import {
  assessJudgeEligibility,
  classifyRunEvidence,
  hasRequiredDmFields,
  isFixedTemplateTranscript,
  isQualifiedLiveEvidence,
  resolveEvalExecutionMode,
  type EvalJudgeMode,
  type JudgeEligibility,
  type RunEvidenceStatus,
} from "../src/lib/evals/productQuality/runOutcome";
import {
  requestClientOptionsRegenEvidence,
  shouldRequestClientOptionsRegen,
  type ClientOptionsRegenEvidence,
} from "../src/lib/evals/clientOptionsRegenEvidence";
import { CHAT_LATENCY_BUDGET } from "../src/lib/perf/waitingConfig";
import { elapsedMs, nowMs } from "../src/lib/turnEngine/chatPerf";
import { DEEP_SCENARIO_IDS, validateScenarioSelection } from "../src/lib/evals/playthrough/deepScenarioMatrix";
import { managedAiConfiguredForTask } from "../src/lib/ai/managed/state";
import { buildWorldGraph, canTraverseWorldEdge } from "../src/lib/revive/graph";
import { canonicalizeWorldLocationId } from "../src/lib/playRealtime/authoredLocationMovementGuard";

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
  sessionsExplicit: boolean;
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
  actionMode: "scripted" | "live" | "hybrid";
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

function normalizeActionMode(value: string | undefined): EvalCli["actionMode"] {
  if (value === "scripted" || value === "live" || value === "hybrid") return value;
  return "scripted";
}

function hasJudgeCredentials(): boolean {
  return Boolean(
    managedAiConfiguredForTask("EVAL_JUDGE")
    ||
    (process.env.AI_GATEWAY_API_KEY && process.env.AI_GATEWAY_BASE_URL)
    || process.env.PLAYTEST_LLM_API_KEY
    || process.env.DEEPSEEK_API_KEY,
  );
}

async function primeManagedJudgeProvider(): Promise<void> {
  try {
    const { ensureManagedAiSnapshot } = await import("../src/lib/ai/managed/runtime");
    await ensureManagedAiSnapshot();
  } catch (error) {
    console.warn(
      `⚠️  托管裁判配置加载失败，将检查独立评测绑定：${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
  const defaults = profile === "deep" ? { sessions: String(DEEP_SCENARIO_IDS.length), steps: "30" } : profile === "standard" ? { sessions: "3", steps: "15" } : { sessions: "2", steps: "8" };
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${args.includes("--live") ? "live" : "mock"}-${profile}`;
  return {
    live: args.includes("--live"),
    baseUrl: get("--base-url", process.env.LIVEPLAY_BASE_URL ?? "http://localhost:666"),
    sessions: parsePosInt(get("--sessions", defaults.sessions), Number(defaults.sessions)),
    sessionsExplicit: args.includes("--sessions"),
    maxSteps: parsePosInt(get("--max-steps", defaults.steps), Number(defaults.steps)),
    outDir: get("--out", `.runtime-data/eval/${runId}`),
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
    // --live-player 保持兼容，但现在明确表示“全程 live”，不会再被 scriptedActions 抢占。
    actionMode: normalizeActionMode(
      get("--action-mode", args.includes("--live-player") ? "live" : "scripted"),
    ),
  };
}

interface SessionSpec {
  scenarioId: string;
  persona: PersonaType;
  description: string;
  scriptedActions?: string[];
}

type SessionStep = {
  step: number;
  action: string;
  narrative: string;
  latencyMs: number;
  dmJson: Record<string, unknown>;
  stateAfter: PlaythroughTranscript["finalState"];
  status: string;
  reachedFinal: boolean;
  authorityEvidence?: PlaythroughTranscript["steps"][number]["authorityEvidence"];
  aiStatus?: string;
  clientOptionRegeneration?: ClientOptionsRegenEvidence;
};

function buildStepAuthorityEvidence(
  before: PlaythroughTranscript["initialState"],
  dmJson: Record<string, unknown>,
): PlaythroughTranscript["steps"][number]["authorityEvidence"] | undefined {
  const from = String(before.playerLocation ?? "").trim();
  const to = typeof dmJson.player_location === "string" ? dmJson.player_location.trim() : "";
  if (!from || !to || from === to) return undefined;
  const canonicalFrom = canonicalizeWorldLocationId(from);
  const canonicalTo = canonicalizeWorldLocationId(to);
  if (canonicalFrom === canonicalTo) {
    return {
      locationNormalization: {
        from,
        to,
        canonical: canonicalTo,
        source: "registered_location_alias",
      },
    };
  }
  const graph = buildWorldGraph({ includeLockedEdges: true });
  const registeredAdjacent = Boolean(graph.get(canonicalFrom)?.has(canonicalTo));
  return {
    locationTransition: {
      from: canonicalFrom,
      to: canonicalTo,
      source: "registered_world_graph",
      registeredAdjacent,
      traversable: registeredAdjacent && canTraverseWorldEdge(canonicalFrom, canonicalTo, before.unlockedFlags),
    },
  };
}

type GameplayGate = {
  passed: boolean;
  required: string[];
  forbidden: string[];
  observed: Record<string, number>;
  missing: string[];
  forbiddenObserved: string[];
};

type SessionResult = {
  sessionIndex: number;
  scenarioId: string;
  persona: PersonaType;
  steps: SessionStep[];
  judgeResult: NarrativeConsistencyResult | null;
  terminatedReason: string;
  totalSteps: number;
  durationMs: number;
  degradedSteps: number;
  judgeMode: EvalJudgeMode;
  executionMode: "mock_full" | "live_full" | "live_degraded";
  initialState: PlaythroughTranscript["initialState"];
  gameplayGate: GameplayGate;
  evidenceStatus: RunEvidenceStatus;
  evidenceReason: string | null;
  judgeEligibility: JudgeEligibility;
  judgePair?: JudgePairReport;
  failureContext?: RunFailureContext;
};

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
  {
    scenarioId: "boundary-system-test",
    persona: "boundary_tester",
    description: "边界测试：非法动作、不存在物品、跨层跳跃、安全区收敛、位置边界",
    scriptedActions: undefined,
  },
  {
    scenarioId: "happy-npc-interaction",
    persona: "social",
    description: "社交者画像：大量NPC对话、多NPC在场互动、世界观询问、NPC认知边界测试",
    scriptedActions: undefined,
  },
];

// ─── 简化单局运行（不依赖完整 orchestrator，直接 SUT 调用）────

async function runSession(
  sessionIndex: number,
  selected: SessionSpec,
  config: EvalCli
): Promise<SessionResult> {
  const startTime = nowMs();
  const scenario = SCENARIOS.find((s) => s.id === selected.scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${selected.scenarioId}`);

  console.log(`\n  🔄 Session ${sessionIndex + 1}/${config.sessions}: ${selected.scenarioId} [${selected.persona}]`);

  // 创建 SUT
  const sut = createSutAdapter({
    mock: !config.live,
    baseUrl: config.baseUrl,
    sessionId: `live-eval-${Date.now()}-${sessionIndex}`,
    frameTimeoutMs: CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms,
  });

  // 初始状态
  const initialState = createInitialStateSnapshot(scenario.initialStateOverride as Record<string, unknown> | undefined);
  let currentState = { ...initialState };
  const steps: SessionStep[] = [];
  let terminatedReason: TerminatedReason = "max_steps";
  let totalSteps = 0;
  let degradedSteps = 0;
  let failureContext: RunFailureContext | null = null;

  try {
    for (let step = 0; step < config.maxSteps; step++) {
      // 玩家动作：scripted=固定回归，live=全程自主，hybrid=脚本完成后自主。
      let action: string;
      const scriptedAction = selected.scriptedActions?.[step];
      const shouldUseScript = config.actionMode === "scripted"
        || (config.actionMode === "hybrid" && Boolean(scriptedAction));
      const shouldUseLivePlayer = config.actionMode === "live"
        || (config.actionMode === "hybrid" && !scriptedAction);

      if (shouldUseScript && scriptedAction) {
        action = scriptedAction;
      } else if (shouldUseLivePlayer) {
        const persona = PERSONAS[selected.persona];
        const previousDm = steps.at(-1)?.dmJson;
        const visibleOptions = Array.isArray(previousDm?.options)
          ? previousDm.options.filter((option): option is string => typeof option === "string").slice(0, 6)
          : [];
        const visibleWeapon = currentState.weaponBag?.find((weapon) =>
          String(weapon.id ?? "") === String(currentState.equippedWeapon ?? ""),
        );
        action = await generatePlayerActionDeepSeek({
          persona: { type: selected.persona, name: persona?.name ?? selected.persona, systemPrompt: persona?.systemPrompt ?? "" },
          campaignGoal: selected.description,
          stepIndex: step,
          transcript: steps.map(s => ({ action: s.action, narrative: s.narrative })),
          state: {
            playerLocation: currentState.playerLocation,
            hp: currentState.hp,
            sanity: currentState.sanity,
            profession: currentState.profession ?? null,
          },
          visibleSnapshot: [
            `原石:${currentState.originium}`,
            `行囊:${currentState.inventoryItemCount}/${currentState.maxInventorySlots}`,
            `当前武器:${String(visibleWeapon?.name ?? (currentState.equippedWeapon ? "已装备武器" : "无"))}`,
            `武器稳定:${currentState.weaponStability}`,
            `武器污染:${currentState.weaponContamination}`,
            `进行中任务数:${currentState.activeTaskIds.length}`,
            `已完成任务数:${currentState.completedTaskIds.length}`,
            `已解锁图鉴数:${currentState.codexNpcIds.length}`,
            `可见选项:${visibleOptions.length > 0 ? visibleOptions.join(" / ") : "当前未显示"}`,
          ].join(" | "),
        });
      } else {
        action = generateMockAction(selected.persona, step, 42 + sessionIndex);
      }

      // SUT 调用
      const response = await sut.step({
        playerAction: action,
        persona: selected.persona,
        stepIndex: step,
        playerContext: `位置:${currentState.playerLocation}；HP:${currentState.hp}/${currentState.maxHp}；理智:${currentState.sanity}；任务:${currentState.activeTaskIds.join(",") || "无"}；图鉴:${currentState.codexNpcIds.join(",") || "无"}；回合:${currentState.turnCount}`,
        clientState: {
          ...buildClientStructuredSnapshot(currentState),
          ...(scenario.clientStateOverride ?? {}),
          playerLocation: currentState.playerLocation,
          player_location: currentState.playerLocation,
        },
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
      const authorityEvidence = buildStepAuthorityEvidence(currentState, response.dmJson);
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
        reachedFinal: response.reachedFinal,
        authorityEvidence,
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

  const durationMs = elapsedMs(startTime);

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
      authorityEvidence: s.authorityEvidence,
      timestamp: Date.now(),
    })),
    initialState,
    finalState: currentState,
    terminatedReason,
    totalSteps,
    durationMs,
  };

  const observed = {
    tasks: steps.filter((step) => Array.isArray(step.dmJson.task_updates) && step.dmJson.task_updates.some((raw) => raw && typeof raw === "object" && !Array.isArray(raw) && ["active", "completed"].includes(String((raw as Record<string, unknown>).status ?? "")))).length,
    codex: steps.filter((step) => Array.isArray(step.dmJson.codex_updates) && step.dmJson.codex_updates.length > 0).length,
    location: steps.filter((step, index) => {
      const before = index === 0 ? initialState.playerLocation : steps[index - 1]!.stateAfter.playerLocation;
      return typeof step.dmJson.player_location === "string" && step.dmJson.player_location.trim().length > 0 && step.dmJson.player_location !== before;
    }).length,
    weapons: steps.filter((step) => ["weapon_updates", "weapon_bag_updates"].some((key) => Array.isArray(step.dmJson[key]) && (step.dmJson[key] as unknown[]).length > 0)).length,
    combat: steps.filter((step, index) => {
      const before = index === 0 ? initialState.hp : steps[index - 1]!.stateAfter.hp;
      return step.dmJson.conflict_outcome != null
        || (Array.isArray(step.dmJson.main_threat_updates) && step.dmJson.main_threat_updates.length > 0)
        || step.stateAfter.hp < before;
    }).length,
    economy: steps.filter((step) => typeof step.dmJson.currency_change === "number" && step.dmJson.currency_change !== 0).length,
    profession: steps.filter((step) => step.dmJson.profession_trial_result != null || typeof step.dmJson.profession === "string").length,
    ending: steps.filter((step) => step.dmJson.ending_finale != null || step.dmJson.reached_ending === true || step.dmJson.is_ending === true).length,
  };
  const required = scenario.requiredFeatureOutcomes ?? [];
  const forbidden = scenario.forbiddenFeatureOutcomes ?? [];
  const missing: string[] = required.filter((id) => observed[id] === 0);
  for (const taskId of scenario.requiredCompletedTaskIds ?? []) {
    if (!currentState.completedTaskIds.includes(taskId)) missing.push(`completed_task:${taskId}`);
  }
  if (scenario.requiredFinalLocation && currentState.playerLocation !== scenario.requiredFinalLocation) {
    missing.push(`final_location:${scenario.requiredFinalLocation}`);
  }
  const forbiddenObserved = forbidden.filter((id) => observed[id] > 0);
  const gameplayGate = { passed: missing.length === 0 && forbiddenObserved.length === 0, required, forbidden, observed, missing, forbiddenObserved };
  const executionMode = resolveEvalExecutionMode({ live: config.live, degradedSteps, terminatedReason });
  let judgeEligibility = assessJudgeEligibility({
    executionMode,
    terminatedReason,
    executedSteps: totalSteps,
    degradedSteps,
    protocolComplete: steps.length > 0 && steps.every((step) => step.reachedFinal),
    requiredDmFieldsComplete: steps.length > 0 && steps.every((step) => hasRequiredDmFields(step.dmJson)),
    fixedTemplateDetected: isFixedTemplateTranscript(steps.map((step) => step.narrative)),
  });
  let judgeResult: NarrativeConsistencyResult | null = null;
  let judgeMode: EvalJudgeMode = "none";
  let judgePair: JudgePairReport | undefined;

  if (judgeEligibility.eligible) {
    if (config.live && (config.judgeMode === "live" || config.judgeMode === "auto")) {
      if (!hasJudgeCredentials()) {
        judgeEligibility = {
          eligible: false,
          status: "infrastructure_failure",
          reason: "真实在线裁判凭据不可用",
        };
      } else {
        try {
          judgeResult = await judgeNarrativeConsistencyLive(transcript);
          if (judgeResult.judgeMode !== "live") {
            throw new Error(`裁判返回了非 live provenance: ${judgeResult.judgeMode ?? "missing"}`);
          }
          judgeMode = "live";
        } catch (error) {
          judgeResult = null;
          judgeMode = "none";
          judgeEligibility = {
            eligible: false,
            status: "infrastructure_failure",
            reason: `真实在线裁判调用失败：${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    } else if (config.judgeMode === "codex") {
      judgeResult = await judgeNarrativeConsistencyCodex(transcript);
      judgeMode = "codex";
    } else {
      judgeResult = judgeNarrativeConsistencyMock(transcript);
      judgeMode = "mock";
    }

    if (config.compareJudge) {
      const mockJudge = judgeNarrativeConsistencyMock(transcript);
      judgePair = {
        mockJudge,
        hasLive: judgeMode === "live" && judgeResult !== null,
        liveJudge: judgeMode === "live" && judgeResult !== null ? judgeResult : undefined,
        scoreGap: null,
        passAgreement: null,
        criticalGap: 0,
        majorGap: 0,
      };
      if (judgePair.liveJudge) {
        judgePair.scoreGap = Math.abs(mockJudge.overallScore - judgePair.liveJudge.overallScore);
        judgePair.criticalGap = Math.abs(
          mockJudge.issues.filter((issue) => issue.severity === "critical").length
          - judgePair.liveJudge.issues.filter((issue) => issue.severity === "critical").length,
        );
        judgePair.majorGap = Math.abs(
          mockJudge.issues.filter((issue) => issue.severity === "major").length
          - judgePair.liveJudge.issues.filter((issue) => issue.severity === "major").length,
        );
        judgePair.passAgreement = mockJudge.passed === judgePair.liveJudge.passed;
      }
    }
  }

  const evidenceStatus = classifyRunEvidence({
    executionMode,
    terminatedReason,
    judgePassed: judgeResult?.passed ?? null,
    judgeMode,
    gameplayGatePassed: gameplayGate.passed,
    executedSteps: totalSteps,
    plannedScenarioSteps: selected.scriptedActions?.length ?? config.maxSteps,
    eligibility: judgeEligibility,
  });

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
    executionMode,
    initialState,
    gameplayGate,
    evidenceStatus,
    evidenceReason: judgeEligibility.reason,
    judgeEligibility,
    judgePair,
    failureContext: failureContext ?? undefined,
  };
}

// ─── 报告生成 ───────────────────────────────────────────

function generateReport(
  results: SessionResult[],
  config: EvalCli
): string {
  const totalSteps = results.reduce((s, r) => s + r.totalSteps, 0);
  const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);
  const denominator = Math.max(1, results.length);
  const qualifiedLiveResults = results.filter((result) => isQualifiedLiveEvidence({
    executionMode: result.executionMode,
    judgeMode: result.judgeMode,
    judgeResult: result.judgeResult,
    evidenceStatus: result.evidenceStatus,
  })) as Array<SessionResult & { judgeResult: NarrativeConsistencyResult }>;
  const avgJudgeScore = qualifiedLiveResults.length > 0
    ? qualifiedLiveResults.reduce((sum, result) => sum + result.judgeResult.overallScore, 0) / qualifiedLiveResults.length
    : null;
  const statusCounts: Record<RunEvidenceStatus, number> = { pass: 0, fail: 0, inconclusive: 0, infrastructure_failure: 0 };
  for (const result of results) statusCounts[result.evidenceStatus] += 1;
  const passedSessions = qualifiedLiveResults.filter((result) => result.evidenceStatus === "pass").length;
  const conclusiveSessions = qualifiedLiveResults.length;
  const mockSessions = results.filter((result) => result.executionMode === "mock_full").length;
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
  lines.push(`> **玩家动作模式**: ${config.actionMode}`);
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
  lines.push(`| Live 通过会话 | ${passedSessions}/${conclusiveSessions} 个合格 live 会话 |`);
  lines.push(`| 证据状态 | pass=${statusCounts.pass}, fail=${statusCounts.fail}, inconclusive=${statusCounts.inconclusive}, infrastructure_failure=${statusCounts.infrastructure_failure} |`);
  lines.push(`| Mock 回归会话 | ${mockSessions}（不进入 live 统计） |`);
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
    const avg = qualifiedLiveResults.length > 0
      ? qualifiedLiveResults.reduce((sum, result) => sum + (result.judgeResult.dimensionScores[dim] ?? 0), 0) / qualifiedLiveResults.length
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
    const evidenceStatus = r.evidenceStatus;
    const icon = evidenceStatus === "pass" ? "✅" : evidenceStatus === "fail" ? "❌" : evidenceStatus === "infrastructure_failure" ? "🛠️" : "⚪";
    lines.push(`### ${icon} Session ${r.sessionIndex + 1}: ${r.scenarioId} [${r.persona}]`);
    lines.push("");
    lines.push(`- **终止原因**: ${r.terminatedReason}`);
    lines.push(`- **总回合数**: ${r.totalSteps}`);
    lines.push(`- **耗时**: ${(r.durationMs / 1000).toFixed(1)}s`);
    lines.push(`- **叙事评分**: ${r.judgeResult ? `${r.judgeResult.overallScore}/5` : `未评分（${r.evidenceReason ?? "证据不可评分"}）`}`);
    lines.push(`- **执行模式**: ${r.executionMode}（降级 ${r.degradedSteps} 回合）`);
    lines.push(`- **裁判模式**: ${r.judgeMode}`);
    if (r.judgePair?.hasLive && r.judgePair.liveJudge) {
      const pair = r.judgePair;
      const liveJudge = pair.liveJudge!;
      lines.push(`- **mock/live 对账**: mock=${pair.mockJudge.overallScore}/5, live=${liveJudge.overallScore}/5, pass一致=${pair.passAgreement === null ? "na" : pair.passAgreement ? "是" : "否"}, 分差=${(pair.scoreGap ?? 0).toFixed(2)}`);
    }
    lines.push(`- **证据状态**: ${evidenceStatus}`);
    lines.push(`- **证据来源**: SUT=${r.executionMode}, judge=${r.judgeMode}`);
    if (r.evidenceReason) lines.push(`- **不可评分原因**: ${r.evidenceReason}`);
    lines.push(`- **玩法结果门禁**: ${r.gameplayGate.passed ? "通过" : evidenceStatus === "inconclusive" ? `未完成（预算截断；尚缺 ${r.gameplayGate.missing.join(", ")}）` : `失败（缺少 ${r.gameplayGate.missing.join(", ")}）`}；observed=${JSON.stringify(r.gameplayGate.observed)}`);
    if (r.judgeResult) {
      lines.push(`- **维度分**: ${JSON.stringify(r.judgeResult.dimensionScores)}`);
      lines.push("");
      lines.push(`#### 问题列表`);
      for (const issue of r.judgeResult.issues) {
        const sevIcon = issue.severity === "critical" ? "🔴" : issue.severity === "major" ? "🟡" : "🟢";
        lines.push(`- ${sevIcon} [${issue.severity}] ${issue.description}`);
      }
      if (r.judgeResult.issues.length === 0) lines.push("- 裁判未发现问题");
      lines.push("");
      lines.push(`#### 裁判推理`);
      lines.push(`> ${r.judgeResult.reasoning}`);
      lines.push("");
    }

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
  const allIssues = qualifiedLiveResults.flatMap((r) => r.judgeResult.issues);
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
  lines.push(`| 平均单步延迟 | ${avgLatency.length > 0 ? `${(avgLatency.reduce((s, v) => s + v, 0) / avgLatency.length).toFixed(0)}ms` : "N/A"} |`);
  lines.push(`| p50 延迟 | ${p50Latency}ms |`);
  lines.push(`| p95 延迟 | ${p95Latency}ms |`);
  lines.push(`| 终止原因分布 | ${results.map((r) => r.terminatedReason).join(", ")} |`);
  lines.push("");

  // 结论
  lines.push("## 结论与建议");
  lines.push("");
  if (conclusiveSessions > 0 && passedSessions === conclusiveSessions && statusCounts.infrastructure_failure === 0 && statusCounts.inconclusive === 0) {
    lines.push("✅ 所有合格 live 会话均通过，且没有不可判定或基础设施失败证据。");
  } else if (conclusiveSessions > 0) {
    lines.push(`⚠️ 合格 live 证据中 ${conclusiveSessions - passedSessions}/${conclusiveSessions} 个会话未通过。`);
  }
  if (statusCounts.infrastructure_failure > 0) lines.push(`🛠️ ${statusCounts.infrastructure_failure} 个会话为基础设施失败，不属于剧情质量结论。`);
  if (statusCounts.inconclusive > 0) lines.push(`⚪ ${statusCounts.inconclusive} 个会话证据不足，未形成质量结论。`);
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

function createInfrastructureFailureResult(args: {
  sessionIndex: number;
  selected: SessionSpec;
  config: EvalCli;
  error: unknown;
}): SessionResult {
  const scenario = SCENARIOS.find((candidate) => candidate.id === args.selected.scenarioId);
  const initialState = createInitialStateSnapshot(scenario?.initialStateOverride as Record<string, unknown> | undefined);
  const reason = `会话执行异常：${args.error instanceof Error ? args.error.message : String(args.error)}`;
  const judgeEligibility: JudgeEligibility = { eligible: false, status: "infrastructure_failure", reason };
  return {
    sessionIndex: args.sessionIndex,
    scenarioId: args.selected.scenarioId,
    persona: args.selected.persona,
    steps: [],
    judgeResult: null,
    terminatedReason: "error",
    totalSteps: 0,
    durationMs: 0,
    degradedSteps: args.config.live ? 1 : 0,
    judgeMode: "none",
    executionMode: args.config.live ? "live_degraded" : "mock_full",
    initialState,
    gameplayGate: { passed: false, required: [], forbidden: [], observed: {}, missing: ["session_execution"], forbiddenObserved: [] },
    evidenceStatus: "infrastructure_failure",
    evidenceReason: reason,
    judgeEligibility,
    failureContext: { reason, stepFailureMode: "session_exception", hasVisibleNarrative: false },
  };
}

// ─── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();
  if (config.live && (config.judgeMode === "live" || config.judgeMode === "auto" || config.compareJudge)) {
    await primeManagedJudgeProvider();
  }
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
  console.log(`玩家动作模式: ${config.actionMode}`);
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

  if (!hasJudgeCredentials() && (config.judgeMode === "live" || config.compareJudge || config.actionMode !== "scripted")) {
    console.log("⚠️  未设置可用的评测模型凭据，玩家 AI 或 live judge 将无法运行。");
    console.log("   设置 AI_GATEWAY_API_KEY + AI_GATEWAY_BASE_URL，或 PLAYTEST_LLM_API_KEY/DEEPSEEK_API_KEY。");
    console.log("");
  }
  if (config.judgeMode === "codex") {
    console.log("ℹ️  当前使用离线 Codex 裁判，不需要 LLM API Key。");
    console.log("");
  }

  // 选择会话
  const selectedIds = config.scenarioIds && config.scenarioIds.length > 0
    ? config.scenarioIds
    : config.profile === "deep"
      ? [...DEEP_SCENARIO_IDS]
      : SELECTED_SCENARIOS.map((scenario) => scenario.scenarioId);
  validateScenarioSelection({
    scenarioIds: selectedIds,
    knownScenarioIds: SCENARIOS.map((scenario) => scenario.id),
    requireDeepCoverage: config.profile === "deep",
  });
  const requestedScenarios = config.scenarioIds && config.scenarioIds.length > 0 || config.profile === "deep"
    ? selectedIds.map((id): SessionSpec => {
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
  if (config.profile === "deep" && config.sessions < requestedScenarios.length) {
    throw new Error(`deep 场景矩阵需要至少 ${requestedScenarios.length} 个会话，--sessions ${config.sessions} 会造成覆盖截断`);
  }
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
  const results: SessionResult[] = [];
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
            authorityEvidence: step.authorityEvidence,
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
        writeFileSync(resolve(tracesDir, `${result.scenarioId}-${result.persona}-${index}.json`), JSON.stringify({
          runId: `live-${result.scenarioId}-${executionId}-${index}`,
          scenarioId: result.scenarioId,
          persona: result.persona,
          initialState: result.initialState,
          steps: traceSteps,
          terminatedReason: result.terminatedReason,
          narrativeConsistency: result.judgeResult,
          provenance: { sut: result.executionMode, judge: result.judgeMode },
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
          evidenceStatus: result.evidenceStatus,
          evidenceReason: result.evidenceReason,
          failureTags: result.evidenceStatus === "fail"
            ? ["quality_failed"]
            : result.evidenceStatus === "infrastructure_failure"
              ? ["infrastructure_failure"]
              : [],
          executionMode: result.executionMode,
          judgeMode: result.judgeMode,
          failureContext: result.failureContext,
        }, null, 2), "utf8");
        return result;
      } catch (err) {
        console.error(`  ❌ Session ${index + 1} 执行异常: ${err instanceof Error ? err.message : String(err)}`);
        const result = createInfrastructureFailureResult({ sessionIndex: index, selected: session, config, error: err });
        writeFileSync(resolve(tracesDir, `${result.scenarioId}-${result.persona}-${index}.json`), JSON.stringify({
          runId: `live-${result.scenarioId}-${executionId}-${index}`,
          scenarioId: result.scenarioId,
          persona: result.persona,
          initialState: result.initialState,
          steps: [],
          terminatedReason: result.terminatedReason,
          narrativeConsistency: null,
          provenance: { sut: result.executionMode, judge: "none" },
          evidenceStatus: result.evidenceStatus,
          evidenceReason: result.evidenceReason,
          failureTags: ["infrastructure_failure"],
          executionMode: result.executionMode,
          judgeMode: result.judgeMode,
          failureContext: result.failureContext,
        }, null, 2), "utf8");
        return result;
      }
    },
  );

  results.push(...runResults);

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
    const evidenceStatus = r.evidenceStatus;
    const score = r.judgeResult ? `${r.judgeResult.overallScore}/5` : `未评分 (${r.evidenceReason ?? "证据不足"})`;
    const icon = evidenceStatus === "pass" ? "✅" : evidenceStatus === "fail" ? "❌" : "⚪";
    console.log(`  ${icon} ${r.scenarioId} [${r.persona}]: ${score}, ${r.totalSteps} 回合, ${(r.durationMs / 1000).toFixed(1)}s, ${evidenceStatus}`);
  }
  const scoreableResults = results.filter((r) => isQualifiedLiveEvidence({ executionMode: r.executionMode, judgeMode: r.judgeMode, judgeResult: r.judgeResult, evidenceStatus: r.evidenceStatus })) as Array<SessionResult & { judgeResult: NarrativeConsistencyResult }>;
  const avgScore = scoreableResults.length > 0
    ? scoreableResults.reduce((s, r) => s + r.judgeResult.overallScore, 0) / scoreableResults.length
    : null;
  console.log(`  平均叙事分: ${avgScore !== null ? `${avgScore.toFixed(2)}/5` : "N/A (无可评分 live 输出)"}`);

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
