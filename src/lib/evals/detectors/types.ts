/**
 * Phase 4: Detector Base Types
 *
 * 统一检测器接口：每个 gap detector 实现 Detector<Input, Output> 接口，
 * 输入输出都是明确的结构化类型，不与 harness Scorer 耦合。
 * Eval 命令层负责把 Detector 输出映射到 ScorerOutput。
 */

import type { EvalMode } from "@/lib/evals/harness/config";

// ── Detector 元数据 ────────────────────────────────────

export type DetectorCategory =
  | "cognitive_reveal"    // 认知与揭示（缺口 1/2/3）
  | "submission_structure" // 提交与结构（缺口 4/5/6/7/8）
  | "cross_cutting";      // 横切（缺口 9/10/11/12）

export type DetectorId =
  // Agent 1
  | "gap-1-reveal-tier-driven"
  | "gap-2-xinlan-exception"
  | "gap-3-canactorknowfact-matrix"
  // Agent 2
  | "gap-4-block-commit-behavior"
  | "gap-5-decision-new-tasks-cap"
  | "gap-6-gain-semantic-degrade"
  | "gap-7-normalize-null-degrade"
  | "gap-8-options-quality"
  // Agent 3
  | "gap-9-latency-budget-harness-gate"
  | "gap-10-taskpolicy-route-invariant"
  | "gap-11-analytics-contract"
  | "gap-12-persona-drift-pronoun-echo";

export interface DetectorMeta {
  id: DetectorId;
  category: DetectorCategory;
  label: string;
  description: string;
  offlineOnly: boolean; // true = 不依赖实时模型，纯函数可离线运行
}

// ── Detector 接口 ──────────────────────────────────────

export interface DetectorResult {
  detectorId: DetectorId;
  /** 0..1, 1 = 完全通过 */
  score: number;
  /** 关键发现/违规列表 */
  issues: DetectorIssue[];
  /** 是否通过本检测器阈值 */
  pass: boolean;
  /** 执行耗时 ms */
  latencyMs: number;
  /** 降级原因，若有 */
  degradeReason?: string;
}

export interface DetectorIssue {
  severity: "info" | "warning" | "critical";
  message: string;
  evidence?: string;
  code?: string;
  location?: string; // 文件/行/字段范围
}

export interface Detector<I = unknown, O extends DetectorResult = DetectorResult> {
  meta: DetectorMeta;
  run(input: I, mode?: EvalMode): O | Promise<O>;
}

// ── 注册表 ─────────────────────────────────────────────

export type DetectorRegistry = Map<DetectorId, Detector>;

export function createDetectorRegistry(detectors: Detector[]): DetectorRegistry {
  const reg: DetectorRegistry = new Map();
  for (const d of detectors) {
    if (reg.has(d.meta.id)) {
      throw new Error(`Duplicate detector id: ${d.meta.id}`);
    }
    reg.set(d.meta.id, d);
  }
  return reg;
}

export function getDetector(id: DetectorId, registry: DetectorRegistry): Detector | undefined {
  return registry.get(id);
}

export function listDetectorsByCategory(
  category: DetectorCategory,
  registry: DetectorRegistry
): Detector[] {
  return [...registry.values()].filter((d) => d.meta.category === category);
}
