/**
 * Harness 配置 — 常量与环境变量读取
 */

export type EvalMode = "mock" | "live";

/** 从环境变量读取模式，兜底 mock */
export function resolveEvalMode(envVar?: string, fallback: EvalMode = "mock"): EvalMode {
  const raw = (envVar ?? "").trim().toLowerCase();
  return raw === "live" ? "live" : fallback;
}

/** 各 suite 的默认 JSON 输出路径前缀 */
export const DEFAULT_OUT_DIR = ".runtime-data/eval";

/** 历史数据目录 */
export const HISTORY_DIR = "benchmarks/history";

/** Live judge 调用上限 */
export const BUDGET = {
  /** judge 校准调用数上限 */
  JUDGE_CALIBRATION: 360,
  /** 单次 live 评测批次上限 */
  LIVE_BATCH: 60,
  /** 单日总调用上限 */
  DAILY_TOTAL: 2000,
  /** 失效前从缓存重放 */
  CACHE_HIT_TTL_MS: 86_400_000, // 24h
} as const;
