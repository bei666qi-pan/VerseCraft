/**
 * LLM-as-Judge 评测框架类型定义
 *
 * 设计参考：
 * - MT-Bench (Zheng et al., 2023): 多轮对话 judge
 * - G-Eval (Liu et al., 2023): 思维链 + 评分表
 * - LLMJudge (Verga et al., 2024): 多裁判 + 位置随机化
 *
 * 核心设计：
 * 1. 严格 Rubric：每个维度有 1-5 分的明确锚点描述
 * 2. 多裁判投票：3-5 个独立 judge，取中位数或共识分
 * 3. 位置随机化：随机打乱对比输出顺序，消除位置偏见
 * 4. 思维链评分：Judge 先分析再打分，提高可解释性
 * 5. 校准集：用已知质量的样本校准 judge 严格度
 */

import type { ChatSseProbeMetrics } from "@/lib/perf/chatSseProbe";

// === Rubric 定义 ===

/** 评分维度锚点：每个分数等级的具体描述 */
export interface ScoreAnchor {
  score: number;         // 1-5
  label: string;         // 如「优秀」「及格」「不及格」
  description: string;   // 该分数对应的具体表现描述
  examples?: string[];   // 该分数的典型示例
}

/** 评分维度 */
export interface JudgeDimension {
  id: string;
  name: string;           // 中文维度名
  description: string;    // 维度说明
  weight: number;         // 权重 0-1，所有权重之和 = 1
  anchors: ScoreAnchor[]; // 从 1 到 5 的锚点
  /** 该维度的硬性底线：低于此分数直接 fail */
  hardFloor?: number;
}

/** 完整的 Rubric 定义 */
export interface JudgeRubric {
  id: string;
  name: string;
  version: string;
  description: string;
  dimensions: JudgeDimension[];
  scale: {
    min: number;    // 1
    max: number;    // 5
    passing: number; // 综合及格线
  };
  /** 综合通过规则 */
  passRule: {
    /** 每个维度不低于此分 */
    minEach?: number;
    /** 加权平均不低于此分 */
    minAverage: number;
    /** 硬性失败条件：指定维度 <= 此分直接 fail */
    hardFailIf?: Record<string, number>;
  };
}

// === Judge 输入/输出 ===

/** 待评审的内容 */
export interface JudgeTarget {
  /** 唯一标识 */
  caseId: string;
  /** 场景描述 */
  scenario: string;
  /** 玩家输入 */
  userInput: string;
  /** AI 生成的叙事文本 */
  narrative: string;
  /** AI 生成的 DM JSON（完整） */
  dmJson: Record<string, unknown>;
  /** 叙事字数 */
  narrativeChars: number;
  /** 选项列表 */
  options: string[];
  /** 性能指标 */
  metrics?: Pick<
    ChatSseProbeMetrics,
    "firstStatusMs" | "firstTokenMs" | "finalMs" | "longGapCount"
  >;
  /** 游戏上下文（供 judge 参考） */
  gameContext?: string;
}

/** 单个 Judge 的评分 */
export interface JudgeVerdict {
  /** Judge 模型标识 */
  judgeModel: string;
  /** Judge 角色（用于去偏见） */
  judgeRole: string;
  /** 各维度分数 */
  dimensionScores: Record<string, number>;
  /** 加权总分 */
  overallScore: number;
  /** 是否通过 */
  passed: boolean;
  /** 评分推理（思维链） */
  reasoning: string;
  /** 发现的具体问题 */
  issues: JudgeIssue[];
  /** 亮点 */
  highlights: string[];
  /** 评分时间戳 */
  timestamp: number;
}

/** Judge 发现的问题 */
export interface JudgeIssue {
  dimension: string;
  severity: "critical" | "major" | "minor";
  description: string;
  /** 引用原文片段 */
  evidence?: string;
}

// === 多裁判聚合 ===

/** 多裁判聚合结果 */
export interface MultiJudgeResult {
  /** 用例 ID */
  caseId: string;
  /** 场景 */
  scenario: string;
  /** 各 judge 的独立评分 */
  verdicts: JudgeVerdict[];
  /** 各维度共识分（中位数） */
  consensusScores: Record<string, number>;
  /** 综合共识分 */
  consensusOverall: number;
  /** 裁判间一致性（1.0 = 完全一致） */
  interJudgeAgreement: number;
  /** 是否通过（多数裁判同意） */
  passed: boolean;
  /** 通过票数 / 总票数 */
  voteCount: { pass: number; fail: number; total: number };
  /** 聚合后的问题（>=2 个 judge 共同发现） */
  commonIssues: JudgeIssue[];
  /** 各维度的方差（衡量争议程度） */
  dimensionVariance: Record<string, number>;
}

// === 批次评测 ===

/** 单次评测运行配置 */
export interface JudgeRunConfig {
  /** Rubric ID */
  rubricId: string;
  /** Judge 数量（默认 3） */
  numJudges: number;
  /** 是否启用位置随机化 */
  positionRandomization: boolean;
  /** 是否启用思维链评分 */
  chainOfThought: boolean;
  /** Judge 使用的逻辑角色（默认 enhance） */
  judgeRole: string;
  /** 是否包含校准样本 */
  calibrationSamples?: JudgeTarget[];
  /** 超时 ms */
  timeoutMs: number;
}

/** 评测运行摘要 */
export interface JudgeRunSummary {
  config: JudgeRunConfig;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  averageScore: number;
  dimensionAverages: Record<string, number>;
  interJudgeAgreementAvg: number;
  /** 高争议案例（方差 > 1.0） */
  highDisagreementCases: string[];
  /** 校准偏移（如果有校准样本） */
  calibrationDrift?: number;
  /** 详细结果 */
  results: MultiJudgeResult[];
  /** 运行时间 */
  durationMs: number;
  /** gate 判定 */
  gatePass: boolean;
}

// === 位置随机化 ===

/** 位置随机化方案 */
export type PositionScheme = "original" | "reversed" | "random";

/** 生成位置方案 */
export function generatePositionScheme(seed: number): PositionScheme {
  // 使用确定性伪随机，确保可复现
  const schemes: PositionScheme[] = ["original", "reversed", "random"];
  return schemes[seed % schemes.length]!;
}

// === 工具函数 ===

/** 计算中位数 */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

/** 计算方差 */
export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

/** 计算裁判间一致性（1 - normalized_std） */
export function interJudgeAgreement(scores: number[][]): number {
  // scores: [judgeIndex][dimensionIndex]
  if (scores.length < 2) return 1;
  const dimCount = scores[0]?.length ?? 0;
  if (dimCount === 0) return 1;

  let totalAgreement = 0;
  for (let d = 0; d < dimCount; d++) {
    const dimScores = scores.map((s) => s[d] ?? 0);
    const v = variance(dimScores);
    // 方差最大为 4（分数 1-5），归一化到 0-1
    const agreement = 1 - Math.min(1, v / 4);
    totalAgreement += agreement;
  }
  return totalAgreement / dimCount;
}
