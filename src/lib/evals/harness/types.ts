/**
 * Harness Core Types — VerseCraft 评测统一类型系统
 *
 * 设计原则：
 * - 每个 EvalCase 携带 id/tags/difficulty/source 元数据
 * - Scorer 接口允许 rule-based / feature-heuristic / LLM judge 三种实现
 * - Reporter 双写全量 JSON + 聚合历史行
 * - Registry 保证 case 元数据可自检
 */

import type { EvalMode } from "./config";

/**
 * 实验溯源身份（供 selfImprove / eval 统一 provenance）。
 * - 所有 eval/bench/playthrough 脚本共享同一套字段
 * - 统一 JSONL 历史，支持跨批次对比
 * - 可审计：谁在什么配置下用什么模型跑了什么数据集
 */
export interface ExperimentProvenance {
  /** Git commit SHA（40 字符完整值） */
  commit: string;
  /** DM stable prompt 版本（来自 VERSECRAFT_DM_STABLE_PROMPT_VERSION） */
  promptVersion: string;
  /** 主模型标识（如 deepseek-v3、gpt-4o） */
  model: string;
  /** 配置快照键（如 "prod-default"、"slow-lane-only"） */
  config: string;
  /** 数据集版本标识（如 "v2.1.0"、"2026-07-09"） */
  datasetVersion: string;
  /** 随机种子（确定性复现） */
  seed: number;
  /** Judge 溯源：judge 模型 + rubric 版本 */
  judgeProvenance: string;
  /** 实验运行的 ISO 时间戳 */
  timestamp: string;
}

// ── Case 元数据 ──────────────────────────────────────────

export type CaseDifficulty = "basic" | "intermediate" | "advanced";

export type CaseSource = "hand" | "synth" | "regression";

/** 基准 EvalCase 骨架 — suite 专用字段由各 rubric 扩展 */
export interface EvalCaseBase {
  id: string;
  tags?: string[];
  difficulty: CaseDifficulty;
  source: CaseSource;
  description: string;
}

// ── Scorer ───────────────────────────────────────────────

export type ScorerType = "rule" | "feature-heuristic" | "judge";

export interface ScorerInput {
  caseId: string;
  narrative: string;
  options: string[];
  rawMetrics?: Record<string, unknown>;
  rubric?: unknown;
}

export interface ScorerResult {
  dimension: string;
  score: number;
  evidence?: string;
  severity?: "info" | "warning" | "critical";
}

export interface ScorerOutput {
  score: number;
  pass: boolean;
  dimensions: ScorerResult[];
  issues: ScorerResult[];
  highlights: string[];
  scorerType: ScorerType;
  modelId?: string;
}

export interface Scorer {
  readonly type: ScorerType;
  score(input: ScorerInput): ScorerOutput | Promise<ScorerOutput>;
}

// ── Eval 运行结果 ────────────────────────────────────────

export interface EvalResultBase {
  caseId: string;
  pass: boolean;
  scorerOutput?: ScorerOutput;
  latencyMs?: number;
  failures: string[];
  raw?: unknown;
}

export interface EvalSummaryBase {
  total: number;
  pass: number;
  passRate: number;
  gate: "pass" | "fail";
  mode: EvalMode;
  suite: string;
  timestamp: string;
}

// ── Reporter ─────────────────────────────────────────────

export interface ReportEntry {
  suite: string;
  mode: EvalMode;
  total: number;
  pass: number;
  passRate: number;
  gate: "pass" | "fail";
  dimensions?: Record<string, number>;
  latencyMs?: { p50: number; p95: number };
  timestamp: string;
  gitSha: string;
}

// ── Registry ─────────────────────────────────────────────

export interface RegistryEntry {
  id: string;
  suite: string;
  difficulty: CaseDifficulty;
  source: CaseSource;
  tags: string[];
  description: string;
}
