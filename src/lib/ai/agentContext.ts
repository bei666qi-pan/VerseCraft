/**
 * Agent Context — 统一开发测试 Agent 的上下文管理
 *
 * 同一个 AI Agent 在 dev 模式和 test 模式之间切换。
 * 此模块提供模式定义、上下文构建、测试范围推断、Worker 状态机、风险路由。
 *
 * 设计原则：
 * - 所有测试代码由同一个 AI（本 Agent）编写和执行
 * - 不调用外部测试 API 或单独的测试 AI
 * - Mock 优先，live 仅用于校准
 * - 状态机强制执行 UNDERSTAND→...→HANDOFF 闭环
 */

import type { ExperimentProvenance } from "@/lib/evals/harness/types";
import { resolveExperimentProvenance } from "@/lib/evals/harness/provenance";

// ── Worker 状态机 ─────────────────────────────────────────

/**
 * Worker 状态 — 统一开发测试闭环的 10 个状态。
 *
 * 状态转换规则见 LOOP-CONTRACT.md §2：
 *   UNDERSTAND → BASELINE → REPRODUCE → IMPLEMENT
 *     → FOCUSED_TEST → ADVERSARIAL_TEST → APP_TEST
 *     → REGRESSION → HANDOFF
 * 任何 TEST 状态失败时回到 IMPLEMENT。
 */
export type WorkerState =
  | "UNDERSTAND"
  | "BASELINE"
  | "REPRODUCE"
  | "IMPLEMENT"
  | "FOCUSED_TEST"
  | "ADVERSARIAL_TEST"
  | "APP_TEST"
  | "REGRESSION"
  | "HANDOFF"
  | "BLOCKED";

/** Worker 姿态 — dev 写代码，test 只审查不写生产代码 */
export type WorkerPosture = "dev" | "test";

/** 状态转换定义 */
export interface StateTransition {
  from: WorkerState;
  to: WorkerState;
  /** 人类可读的转换条件 */
  condition: string;
  /** 是否自动推进（无需外部输入） */
  autoAdvance: boolean;
}

/** 测试阶段预算（毫秒） */
export interface TestBudget {
  focusedMs: number;
  adversarialMs: number;
  appTestMs: number;
  regressionMs: number;
}

/** 默认测试预算 */
export const DEFAULT_TEST_BUDGET: TestBudget = {
  focusedMs: 2 * 60_000,
  adversarialMs: 5 * 60_000,
  appTestMs: 10 * 60_000,
  regressionMs: 10 * 60_000,
};

/**
 * 所有合法的状态转换。
 *
 * 主线：
 *   UNDERSTAND → BASELINE → REPRODUCE → IMPLEMENT
 *     → FOCUSED_TEST → ADVERSARIAL_TEST → APP_TEST → REGRESSION → HANDOFF
 *
 * 失败回环：
 *   FOCUSED_TEST → IMPLEMENT
 *   ADVERSARIAL_TEST → IMPLEMENT
 *   APP_TEST → IMPLEMENT
 *   REGRESSION → IMPLEMENT
 *
 * 环境阻塞：
 *   任何状态 → BLOCKED（外部条件不满足）
 *   BLOCKED → REPRODUCE（条件恢复后从 RED 重新开始）
 */
export const STATE_TRANSITIONS: StateTransition[] = [
  // 主推进线
  { from: "UNDERSTAND", to: "BASELINE", condition: "模块理解完成，验收标准已列出", autoAdvance: true },
  { from: "BASELINE", to: "REPRODUCE", condition: "git 基线已记录，现有测试状态已知", autoAdvance: true },
  { from: "REPRODUCE", to: "IMPLEMENT", condition: "失败复现已建立 / 先红测试已写入", autoAdvance: true },
  { from: "IMPLEMENT", to: "FOCUSED_TEST", condition: "最小修改已完成", autoAdvance: true },
  { from: "FOCUSED_TEST", to: "ADVERSARIAL_TEST", condition: "focused test 全部通过", autoAdvance: true },
  { from: "ADVERSARIAL_TEST", to: "APP_TEST", condition: "adversarial test 全部通过", autoAdvance: true },
  { from: "APP_TEST", to: "REGRESSION", condition: "app test 全部通过", autoAdvance: true },
  { from: "REGRESSION", to: "HANDOFF", condition: "回归矩阵全部通过", autoAdvance: true },

  // 失败回环
  { from: "FOCUSED_TEST", to: "IMPLEMENT", condition: "focused test 失败，需修复", autoAdvance: false },
  { from: "ADVERSARIAL_TEST", to: "IMPLEMENT", condition: "adversarial test 失败，需修复", autoAdvance: false },
  { from: "APP_TEST", to: "IMPLEMENT", condition: "app test 失败，需修复", autoAdvance: false },
  { from: "REGRESSION", to: "IMPLEMENT", condition: "本次改动引入的回归失败", autoAdvance: false },

  // 环境阻塞
  { from: "UNDERSTAND", to: "BLOCKED", condition: "无法读取关键文件", autoAdvance: false },
  { from: "BASELINE", to: "BLOCKED", condition: "环境不可用（无法运行基线测试）", autoAdvance: false },
  { from: "REPRODUCE", to: "BLOCKED", condition: "环境不可用（无法复现）", autoAdvance: false },
  { from: "IMPLEMENT", to: "BLOCKED", condition: "外部依赖不可用", autoAdvance: false },
  { from: "FOCUSED_TEST", to: "BLOCKED", condition: "测试环境不可用", autoAdvance: false },
  { from: "ADVERSARIAL_TEST", to: "BLOCKED", condition: "测试环境不可用", autoAdvance: false },
  { from: "APP_TEST", to: "BLOCKED", condition: "应用无法启动", autoAdvance: false },
  { from: "REGRESSION", to: "BLOCKED", condition: "回归环境不可用", autoAdvance: false },
  { from: "BLOCKED", to: "REPRODUCE", condition: "阻塞条件已解除", autoAdvance: false },
];

/**
 * 检查状态转换是否合法。
 */
export function isValidTransition(from: WorkerState, to: WorkerState): boolean {
  return STATE_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/**
 * 获取从当前状态出发的所有可能下一状态。
 */
export function nextStates(from: WorkerState): WorkerState[] {
  return STATE_TRANSITIONS
    .filter((t) => t.from === from)
    .map((t) => t.to);
}

/**
 * 获取指定转换的详细信息。
 */
export function getTransition(from: WorkerState, to: WorkerState): StateTransition | undefined {
  return STATE_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/**
 * 获取某个 Worker 状态的姿态。
 *
 * UNDERSTAND/BASELINE/REPRODUCE/IMPLEMENT → dev
 * FOCUSED_TEST/ADVERSARIAL_TEST/APP_TEST/REGRESSION → test
 * HANDOFF/BLOCKED → test（只读）
 */
export function getPosture(state: WorkerState): WorkerPosture {
  switch (state) {
    case "UNDERSTAND":
    case "BASELINE":
    case "REPRODUCE":
    case "IMPLEMENT":
      return "dev";
    case "FOCUSED_TEST":
    case "ADVERSARIAL_TEST":
    case "APP_TEST":
    case "REGRESSION":
    case "HANDOFF":
    case "BLOCKED":
      return "test";
  }
}

/**
 * Worker 状态循环上限 — 同一 IMPLEMENT→TEST→IMPLEMENT 循环最多 5 次。
 */
export const MAX_FIX_LOOP = 5;

/**
 * 判断是否已达到修复循环上限。
 */
export function isLoopExhausted(loopCount: number): boolean {
  return loopCount >= MAX_FIX_LOOP;
}

// ── 风险分级 ──────────────────────────────────────────────

/**
 * 改动风险级别。
 *
 * L0: 文档/注释/无行为配置
 * L1: 纯函数、小范围非关键逻辑
 * L2: 前端/Zustand/表单/普通 API
 * L3: /api/chat/SSE/状态提交/存档/数据库/AI 网关
 * L4: prompt/叙事质量/安全/World Director/发布路径
 */
export type RiskLevel = "L0" | "L1" | "L2" | "L3" | "L4";

/**
 * 根据修改路径推断风险级别。
 */
export function inferRiskLevel(changedFiles: string[]): RiskLevel {
  // 空列表：默认 L1（无改动时最安全的假设）
  if (changedFiles.length === 0) {
    return "L1";
  }

  let maxLevel = 0;
  let matchedL0 = false; // 区分"匹配到 L0 文档"与"未匹配任何规则"

  for (const file of changedFiles) {
    let level = 0;

    // L4: 叙事/安全/World Director
    if (
      file.includes("src/lib/security/") ||
      file.includes("src/lib/epistemic/") ||
      file.includes("src/lib/npcConsistency/") ||
      file.includes("src/lib/narrativeGovernance/") ||
      file.includes("src/lib/narrativeEngine/") ||
      file.includes("src/lib/worldEngine/") ||
      file.includes("src/lib/endings/") ||
      file.includes("src/lib/evals/judge/")
    ) {
      level = 4;
    }

    // L3: /api/chat/SSE/数据库/AI 网关
    if (
      file.includes("src/app/api/chat/") ||
      file.includes("src/lib/playRealtime/") ||
      file.includes("src/lib/turnEngine/") ||
      file.includes("src/db/") ||
      file.includes("src/lib/ai/") ||
      file.includes("src/lib/analytics/") ||
      file.includes("src/lib/state/")
    ) {
      level = Math.max(level, 3);
    }

    // L2: 前端/Zustand/表单/普通 API
    if (
      file.includes("src/store/") ||
      file.includes("src/components/") ||
      file.includes("src/features/") ||
      file.includes("src/app/") ||
      file.includes("e2e/") ||
      file.includes("src/middleware") ||
      file.includes("src/lib/combat/") ||
      file.includes("src/lib/chapters/")
    ) {
      level = Math.max(level, 2);
    }

    // L1: 纯函数/小范围逻辑
    if (
      file.startsWith("src/") &&
      (file.endsWith(".ts") || file.endsWith(".tsx"))
    ) {
      level = Math.max(level, 1);
    }

    // L0: 文档 — 使用标记变量来区分"确实是 L0"与"未匹配"
    if (
      file.startsWith("docs/") ||
      file.startsWith("README") ||
      file.endsWith(".md")
    ) {
      matchedL0 = true;
      // 文档也可能触发更高级别（如安全文档可设为 L4）
      // level 保持当前值，不强制设为 0
    }

    maxLevel = Math.max(maxLevel, level);
  }

  // 如果所有文件都只匹配了 L0 规则（文档），返回 L0
  if (maxLevel === 0 && matchedL0) {
    return "L0";
  }

  // 兜底：无匹配规则时默认 L1
  if (maxLevel === 0) {
    return "L1";
  }

  const riskMap: Record<number, RiskLevel> = { 0: "L0", 1: "L1", 2: "L2", 3: "L3", 4: "L4" };
  return riskMap[maxLevel] ?? "L1";
}

/**
 * 根据风险级别获取推荐的测试预算。
 */
export function getTestBudget(risk: RiskLevel): TestBudget {
  switch (risk) {
    case "L0":
      return { focusedMs: 0, adversarialMs: 0, appTestMs: 0, regressionMs: 0 };
    case "L1":
      return { focusedMs: 30_000, adversarialMs: 60_000, appTestMs: 0, regressionMs: 120_000 };
    case "L2":
      return { focusedMs: 60_000, adversarialMs: 120_000, appTestMs: 300_000, regressionMs: 300_000 };
    case "L3":
      return { focusedMs: 120_000, adversarialMs: 300_000, appTestMs: 600_000, regressionMs: 600_000 };
    case "L4":
      return { focusedMs: 300_000, adversarialMs: 600_000, appTestMs: 900_000, regressionMs: 900_000 };
  }
}

/**
 * 风险级别对应的必需测试模式。
 */
export function getRequiredTestModes(risk: RiskLevel): string[] {
  switch (risk) {
    case "L0":
      return [];
    case "L1":
      return ["focused"];
    case "L2":
      return ["focused", "adversarial", "app"];
    case "L3":
      return ["focused", "adversarial", "app", "regression"];
    case "L4":
      return ["focused", "adversarial", "app", "regression", "live_eval"];
  }
}

// ── 模式定义 ──────────────────────────────────────────────

/** Agent 运行模式 */
export type AgentMode = "dev" | "test";

/** 测试范围 */
export interface TestScope {
  /** 推断的风险级别 */
  riskLevel?: RiskLevel;
  /** unit test 文件 glob 模式 */
  unit: string[];
  /** contract test 文件 */
  contract: string[];
  /** e2e spec 文件 */
  e2e: string[];
  /** eval 维度 */
  eval: string[];
  /** benchmark 维度 */
  benchmark: string[];
}

/** 测试报告 */
export interface AgentTestReport {
  /** 测试时间 */
  timestamp: string;
  /** 实验溯源 */
  provenance: ExperimentProvenance;
  /** 触发测试的 diff */
  diff: {
    files: string[];
    summary: string;
  };
  /** 各层测试结果 */
  tests: {
    unit?: { total: number; pass: number; fail: number };
    contract?: { total: number; pass: number; fail: number };
    lint?: { errors: number; warnings: number };
    build?: { success: boolean; error?: string };
  };
  /** eval 结果（mock 模式） */
  evals?: Record<string, { passRate: number; gate: "pass" | "fail" }>;
  /** 综合判定 */
  verdict: "pass" | "fail";
  /** 失败详情 */
  failures?: string[];
  /** Worker 状态追踪 */
  workerState?: WorkerState;
  /** 修复循环计数 */
  fixLoopCount?: number;
}

/** Agent 上下文 */
export interface AgentContext {
  /** 当前模式 */
  mode: AgentMode;
  /** Worker 当前状态 */
  workerState: WorkerState;
  /** 实验溯源 */
  provenance: ExperimentProvenance;
  /** 受影响的模块列表 */
  affectedModules: string[];
  /** 自动检测的测试范围 */
  testScope: TestScope;
  /** 当前风险级别 */
  riskLevel: RiskLevel;
  /** 修复循环计数 */
  fixLoopCount: number;
  /** 最近一次修改的 diff */
  lastDiff?: {
    files: string[];
    summary: string;
  };
  /** 最近一次测试报告 */
  lastTestReport?: AgentTestReport;
}

// ── 上下文构建 ────────────────────────────────────────────

/** 创建默认 Agent 上下文 */
export function createAgentContext(
  mode: AgentMode,
  overrides?: Partial<AgentContext>,
): AgentContext {
  const changedFiles = overrides?.lastDiff?.files ?? [];
  return {
    mode,
    workerState: "UNDERSTAND",
    provenance: resolveExperimentProvenance(),
    affectedModules: [],
    riskLevel: inferRiskLevel(changedFiles),
    testScope: { unit: [], contract: [], e2e: [], eval: [], benchmark: [] },
    fixLoopCount: 0,
    ...overrides,
  };
}

// ── 测试范围推断 ──────────────────────────────────────────

/**
 * 根据修改的文件路径推断需要运行的测试范围。
 *
 * 规则表见 docs/ai-dev-test-agent.md 第 4 节 + TEST_SCOPE_MAP.md。
 */
export function inferTestScope(changedFiles: string[]): TestScope {
  const scope: TestScope = {
    riskLevel: inferRiskLevel(changedFiles),
    unit: [],
    contract: [],
    e2e: [],
    eval: [],
    benchmark: [],
  };

  const addUnit = (p: string) => scope.unit.push(p);
  const addContract = (p: string) => scope.contract.push(p);
  const addE2e = (p: string) => scope.e2e.push(p);
  const addEval = (p: string) => scope.eval.push(p);
  const addBench = (p: string) => scope.benchmark.push(p);

  for (const file of changedFiles) {
    // Turn Engine
    if (file.includes("src/lib/turnEngine/")) {
      addUnit("src/lib/turnEngine/*.test.ts");
      addContract("src/lib/playRealtime/chatRouteContract.test.ts");
    }

    // Play Realtime (prompt, DM JSON)
    if (file.includes("src/lib/playRealtime/")) {
      addContract("src/lib/playRealtime/chatRouteContract.test.ts");
      addBench("chat-metrics");
    }

    // API Chat Route
    if (file.includes("src/app/api/chat/")) {
      addContract("src/lib/playRealtime/chatRouteContract.test.ts");
      addContract("src/app/api/chat/controlPreflightBudget.contract.test.ts");
      addE2e("chat-sse-contract.spec.ts");
      addBench("chat-metrics");
    }

    // Eval infrastructure
    if (file.includes("src/lib/evals/")) {
      addUnit("src/lib/evals/**/*.test.ts");
    }

    // Store
    if (file.includes("src/store/")) {
      addUnit("src/store/**/*.test.ts");
      addE2e("play.spec.ts");
      addE2e("idb-hydration.spec.ts");
    }

    // DB / Schema
    if (file.includes("src/db/")) {
      addUnit("src/db/**/*.test.ts");
    }

    // AI module
    if (file.includes("src/lib/ai/")) {
      addUnit("src/lib/ai/**/*.test.ts");
      addEval("chat-quality");
    }

    // Security
    if (file.includes("src/lib/security/")) {
      addEval("narrative-safety");
    }

    // NPC consistency
    if (file.includes("src/lib/npcConsistency/")) {
      addEval("npc-consistency");
    }

    // Epistemic filtering
    if (file.includes("src/lib/epistemic/")) {
      addUnit("src/lib/epistemic/*.test.ts");
      addEval("narrative-safety");
    }

    // Chapters
    if (file.includes("src/lib/chapters/")) {
      addUnit("src/lib/chapters/*.test.ts");
      addE2e("chapter-flow.spec.ts");
    }

    // Combat
    if (file.includes("src/lib/combat/")) {
      addUnit("src/lib/combat/*.test.ts");
    }

    // General source changes — infer matching test file
    if (file.startsWith("src/") && file.endsWith(".ts") && !file.endsWith(".test.ts")) {
      const testFile = file.replace(/\.ts$/, ".test.ts");
      addUnit(testFile);
    }
  }

  // 去重
  scope.unit = [...new Set(scope.unit)];
  scope.contract = [...new Set(scope.contract)];
  scope.e2e = [...new Set(scope.e2e)];
  scope.eval = [...new Set(scope.eval)];
  scope.benchmark = [...new Set(scope.benchmark)];

  return scope;
}

// ── 报告生成 ──────────────────────────────────────────────

/** 创建空的通过报告 */
export function createPassReport(
  provenance: ExperimentProvenance,
  changedFiles: string[],
  summary: string,
): AgentTestReport {
  return {
    timestamp: new Date().toISOString(),
    provenance,
    diff: { files: changedFiles, summary },
    tests: {
      unit: { total: 0, pass: 0, fail: 0 },
      lint: { errors: 0, warnings: 0 },
      build: { success: true },
    },
    verdict: "pass",
  };
}

/** 从失败列表创建失败报告 */
export function createFailReport(
  provenance: ExperimentProvenance,
  changedFiles: string[],
  summary: string,
  failures: string[],
): AgentTestReport {
  return {
    timestamp: new Date().toISOString(),
    provenance,
    diff: { files: changedFiles, summary },
    tests: {},
    verdict: "fail",
    failures,
  };
}

// ── 辅助工具 ──────────────────────────────────────────────

/** 判断 Agent 是否可以继续（上次测试通过） */
export function canProceed(context: AgentContext): boolean {
  if (!context.lastTestReport) return true;
  return context.lastTestReport.verdict === "pass";
}

/** 获取需要修复的失败列表 */
export function getFailures(context: AgentContext): string[] {
  return context.lastTestReport?.failures ?? [];
}

/** 从 Agent 上下文生成 CLI 可用的环境变量 */
export function agentEnvFromContext(context: AgentContext): Record<string, string> {
  return {
    VERSECRAFT_DM_STABLE_PROMPT_VERSION: context.provenance.promptVersion,
    VERSECRAFT_EVAL_CONFIG: context.provenance.config,
    VERSECRAFT_EVAL_DATASET_VERSION: context.provenance.datasetVersion,
    VERSECRAFT_EVAL_SEED: String(context.provenance.seed),
  };
}

// ── 状态追踪 ──────────────────────────────────────────────

/** 单次状态转换记录 */
export interface StateLogEntry {
  from: WorkerState;
  to: WorkerState;
  timestamp: string;
  /** 转换原因/证据 */
  reason: string;
  /** 测试退出码（仅 TEST 状态） */
  exitCode?: number;
  /** 测试断言数量（仅 TEST 状态） */
  assertionCount?: number;
}

/** Worker 执行日志 */
export interface WorkerStateLog {
  entries: StateLogEntry[];
  startedAt: string;
  fixLoopCount: number;
}

/** 创建空的 Worker 状态日志 */
export function createStateLog(): WorkerStateLog {
  return {
    entries: [],
    startedAt: new Date().toISOString(),
    fixLoopCount: 0,
  };
}

/**
 * 记录一次状态转换。
 * 返回更新后的日志（不可变风格）。
 */
export function recordTransition(
  log: WorkerStateLog,
  from: WorkerState,
  to: WorkerState,
  reason: string,
  detail?: { exitCode?: number; assertionCount?: number },
): WorkerStateLog {
  const entry: StateLogEntry = {
    from,
    to,
    timestamp: new Date().toISOString(),
    reason,
    exitCode: detail?.exitCode,
    assertionCount: detail?.assertionCount,
  };

  // 检测 IMPLEMENT→TEST→IMPLEMENT 回环
  let newLoopCount = log.fixLoopCount;
  if (to === "IMPLEMENT" && from !== "UNDERSTAND" && from !== "BASELINE" && from !== "REPRODUCE") {
    newLoopCount = log.fixLoopCount + 1;
  }

  return {
    entries: [...log.entries, entry],
    startedAt: log.startedAt,
    fixLoopCount: newLoopCount,
  };
}

/**
 * 验证 Worker 是否已完成必需的状态。
 *
 * 根据风险级别检查所有 requiredTestModes 是否都通过了。
 */
export function validateWorkerLoop(
  log: WorkerStateLog,
  riskLevel: RiskLevel,
): { complete: boolean; missingStates: WorkerState[]; loopExhausted: boolean } {
  const requiredModes = getRequiredTestModes(riskLevel);
  const visitedStates = new Set(log.entries.map((e) => e.to));

  // 映射 requiredTestModes 到 WorkerState
  const modeToState: Record<string, WorkerState> = {
    focused: "FOCUSED_TEST",
    adversarial: "ADVERSARIAL_TEST",
    app: "APP_TEST",
    regression: "REGRESSION",
    live_eval: "REGRESSION", // live_eval 视为 REGRESSION 的一部分
  };

  const missingStates: WorkerState[] = [];
  for (const mode of requiredModes) {
    const state = modeToState[mode];
    if (state && !visitedStates.has(state)) {
      missingStates.push(state);
    }
  }

  // 检查是否到达 HANDOFF
  const reachedHandoff = visitedStates.has("HANDOFF");
  const loopExhausted = isLoopExhausted(log.fixLoopCount);

  return {
    complete: reachedHandoff && missingStates.length === 0 && !loopExhausted,
    missingStates,
    loopExhausted,
  };
}

/**
 * 生成人类可读的 Worker 状态摘要。
 */
export function formatStateLog(log: WorkerStateLog): string {
  const lines: string[] = [];
  lines.push(`Worker 状态日志 — 开始于 ${log.startedAt}`);
  lines.push(`修复循环次数: ${log.fixLoopCount}/${MAX_FIX_LOOP}`);
  lines.push("");

  for (const entry of log.entries) {
    const icon = entry.to === "HANDOFF" ? "✅" : entry.to === "BLOCKED" ? "🚫" : "→";
    const detail = entry.exitCode !== undefined
      ? ` (exit=${entry.exitCode}, assertions=${entry.assertionCount ?? "?"})`
      : "";
    lines.push(`  ${icon} ${entry.from} → ${entry.to}${detail}: ${entry.reason}`);
  }

  return lines.join("\n");
}

// ── 报告验证 ──────────────────────────────────────────────

/**
 * 验证 AgentTestReport 是否包含必需的 provenance 字段。
 *
 * @returns 缺失的字段列表，空数组表示完整。
 */
export function validateReportProvenance(report: AgentTestReport): string[] {
  const missing: string[] = [];
  const p = report.provenance;

  if (!p.commit || p.commit.length < 40) missing.push("provenance.commit (完整 40-char SHA)");
  if (!p.promptVersion || p.promptVersion === "default") missing.push("provenance.promptVersion");
  if (!p.model || p.model === "unknown") missing.push("provenance.model");
  if (!p.config || p.config === "default") missing.push("provenance.config");
  if (!p.datasetVersion || p.datasetVersion === "current") missing.push("provenance.datasetVersion");
  if (p.seed === undefined || p.seed === null) missing.push("provenance.seed");
  if (!p.judgeProvenance || p.judgeProvenance.includes("unknown")) missing.push("provenance.judgeProvenance");
  if (!p.timestamp) missing.push("provenance.timestamp");

  return missing;
}

/**
 * 检查报告是否通过完整性验证。
 * 缺失 provenance 字段时返回 warning（不阻止通过，但记录问题）。
 */
export function checkReportIntegrity(report: AgentTestReport): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Provenance 验证
  const missingProv = validateReportProvenance(report);
  if (missingProv.length > 0) {
    warnings.push(`Provenance 缺失字段: ${missingProv.join(", ")}`);
  }

  // Verdict 必须是 pass 或 fail
  if (report.verdict !== "pass" && report.verdict !== "fail") {
    errors.push(`无效的 verdict: ${report.verdict}`);
  }

  // 如果有 failures 但 verdict 是 pass，矛盾
  if (report.failures && report.failures.length > 0 && report.verdict === "pass") {
    errors.push("verdict=pass 但 failures 非空 — 矛盾");
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
