/**
 * DeepEval 集成索引
 *
 * 导出：
 * - metrics: 叙事质量评估维度定义
 * - calibration: 裁判校准系统
 * - runner: 评估运行器
 *
 * 与现有 judge/ 框架的关系：
 * - judge/ 做多裁判投票 + 位置随机化 + 批次评估
 * - deepEval/ 做 DeepEval 原生指标 + 校准集 + 对话模拟器集成
 * - 两者共享 rubric 定义和维度体系
 */

export { NARRATIVE_METRICS, METRICS_BY_ID, toDeepEvalResult } from "./metrics";
export type { NarrativeMetric, RubricAnchor, DeepEvalCompatibleResult } from "./metrics";
export {
  CALIBRATION_SEEDS,
  spearmanRho,
  pearsonR,
  computeCalibrationStats,
} from "./calibration";
export type { CalibrationSample, CalibrationStats } from "./calibration";
