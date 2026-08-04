/**
 * 实验溯源解析器
 *
 * 从环境变量和系统信息组装 ExperimentProvenance。
 * 所有 eval/bench/playthrough 脚本统一通过此模块获取溯源身份，
 * 确保 commit、promptVersion、model、config、datasetVersion、seed、judgeProvenance
 * 在每次实验中一致且可审计。
 */

import type { ExperimentProvenance } from "./types";
import { getGitSha } from "./utils";

/** 从环境变量读取 prompt 版本 */
export function resolvePromptVersion(): string {
  return (process.env.VERSECRAFT_DM_STABLE_PROMPT_VERSION ?? "default").trim() || "default";
}

/** 从环境变量读取主模型标识 */
export function resolveModel(): string {
  return (process.env.AI_MODEL_CHAT ?? process.env.AI_MODEL ?? "unknown").trim() || "unknown";
}

/** 从环境变量读取配置快照键 */
export function resolveConfig(): string {
  return (process.env.VERSECRAFT_EVAL_CONFIG ?? "default").trim() || "default";
}

/** 从环境变量读取数据集版本 */
export function resolveDatasetVersion(): string {
  return (process.env.VERSECRAFT_EVAL_DATASET_VERSION ?? "current").trim() || "current";
}

/** 从环境变量读取随机种子 */
export function resolveSeed(): number {
  const raw = process.env.VERSECRAFT_EVAL_SEED;
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  // 默认用时间戳低位作为确定性种子
  return Date.now() % 1_000_000;
}

/** 从环境变量读取 judge 溯源 */
export function resolveJudgeProvenance(): string {
  const judgeModel = (process.env.AI_MODEL_JUDGE ?? process.env.AI_MODEL_ENHANCE ?? "unknown").trim();
  const rubricVersion = (process.env.VERSECRAFT_EVAL_RUBRIC_VERSION ?? "current").trim();
  return `${judgeModel}@${rubricVersion}`;
}

/**
 * 组装完整的实验溯源身份。
 *
 * 所有字段均可通过环境变量覆盖：
 * - VERSECRAFT_DM_STABLE_PROMPT_VERSION → promptVersion
 * - AI_MODEL_CHAT / AI_MODEL → model
 * - VERSECRAFT_EVAL_CONFIG → config
 * - VERSECRAFT_EVAL_DATASET_VERSION → datasetVersion
 * - VERSECRAFT_EVAL_SEED → seed
 * - AI_MODEL_JUDGE / AI_MODEL_ENHANCE + VERSECRAFT_EVAL_RUBRIC_VERSION → judgeProvenance
 */
export function resolveExperimentProvenance(overrides?: Partial<ExperimentProvenance>): ExperimentProvenance {
  const provenance: ExperimentProvenance = {
    commit: getGitSha(),
    promptVersion: resolvePromptVersion(),
    model: resolveModel(),
    config: resolveConfig(),
    datasetVersion: resolveDatasetVersion(),
    seed: resolveSeed(),
    judgeProvenance: resolveJudgeProvenance(),
    timestamp: new Date().toISOString(),
    ...overrides,
  };
  return provenance;
}
