/**
 * Gold Set 类型定义
 *
 * Gold Set = 经多方标注的叙事质量真值数据集。
 * 用于校准 judge 系统，替代 judge 自证正确的循环。
 */

import type { ExperimentProvenance } from "../../src/lib/evals/harness/types";
import type { PlaythroughTranscript } from "../../src/lib/evals/playthrough/types";

// ── Gold Set Entry ────────────────────────────────────────

/** 单条 gold set 条目 */
export interface GoldSetEntry {
  /** 全局唯一 ID */
  entryId: string;
  /** 场景 ID */
  scenarioId: string;
  /** 场景类别 */
  category: string;
  /** 轨迹 A（通常为较优者） */
  traceA: PlaythroughTranscript;
  /** 轨迹 B（通常为较劣者或对照组） */
  traceB: PlaythroughTranscript;
  /** 标注记录 */
  annotations: PairwiseAnnotation[];
  /** 共识偏好 */
  consensusPreference: "A" | "B" | "tie";
  /** 标注者间一致性（0-1） */
  agreementScore: number;
  /** 争议标志：标注者未达成一致 */
  disputed: boolean;
  /** 创建时间 */
  createdAt: string;
  /** 实验溯源 */
  provenance: ExperimentProvenance;
}

// ── Pairwise 标注 ─────────────────────────────────────────

/** 单次 pairwise 标注记录 */
export interface PairwiseAnnotation {
  /** 标注者 ID（如 judge 模型名） */
  annotatorId: string;
  /** 标注者角色 */
  annotatorRole: string;
  /** 偏好：A 更好 / B 更好 / 平局 */
  preference: "A" | "B" | "tie";
  /** 置信度 (1-5) */
  confidence: number;
  /** 推理过程 */
  reasoning: string;
  /** 各维度偏好（可选，用于细粒度分析） */
  dimensionPreferences?: Record<string, "A" | "B" | "tie">;
  /** 标注时间 */
  timestamp: string;
}

// ── Gold Set 元数据 ───────────────────────────────────────

/** Gold Set 集合元数据 */
export interface GoldSetMetadata {
  /** 集合版本 */
  version: string;
  /** 条目数 */
  totalEntries: number;
  /** 争议条目数 */
  disputedEntries: number;
  /** 标注者列表 */
  annotators: string[];
  /** 场景类别分布 */
  categoryDistribution: Record<string, number>;
  /** 共识分布 */
  consensusDistribution: { A: number; B: number; tie: number };
  /** 平均一致性 */
  averageAgreement: number;
  /** 最后更新时间 */
  lastUpdated: string;
}

/** Gold Set 集合文件格式 */
export interface GoldSetFile {
  metadata: GoldSetMetadata;
  entries: GoldSetEntry[];
}

// ── 校准样本格式（供 judge 校准使用）──────────────────────

/** 单条校准样本（从 gold set 提取） */
export interface CalibrationSample {
  sampleId: string;
  scenarioId: string;
  scenario: string;
  narrative: string;
  dmJson: Record<string, unknown>;
  /** 人工标注的 gold score（1-5） */
  goldScore: number;
  /** 标注者间一致性 */
  annotatorAgreement: number;
  /** 争议标志 */
  disputed: boolean;
}
