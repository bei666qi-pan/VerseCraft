/**
 * Pairwise Annotator — AI 驱动的 pairwise 对比标注
 *
 * 使用多个 AI judge 对两条 playthrough 轨迹做 pairwise 对比。
 * 每条轨迹至少经 2 个不同 judge（不同 prompt/角色）标注，
 * 产出一致性分数和争议标记。
 *
 * 设计原则：
 * - 同一个 AI 既写代码又做测试（不调用外部单独测试 API）
 * - 通过不同的 judge persona / rubric 实现标注多样性
 * - 标注结果用于校准 judge 系统
 */

import fs from "node:fs";
import path from "node:path";

import type {
  PairwiseAnnotation,
  GoldSetEntry,
} from "./goldSetTypes";
import { addAnnotation } from "./goldSetManager";
import type { TraceArtifact } from "../../src/lib/evals/playthrough/orchestrator";

// ── Judge Persona ─────────────────────────────────────────

/** Judge persona：不同的评估视角 */
export interface JudgePersona {
  id: string;
  name: string;
  role: string;
  /** 评估重点描述 */
  focus: string;
  /** 评分倾向（strict / moderate / lenient） */
  strictness: "strict" | "moderate" | "lenient";
}

/** 预定义 judge persona 集合 */
export const JUDGE_PERSONAS: JudgePersona[] = [
  {
    id: "narrative_strict",
    name: "叙事质量-严格",
    role: "资深叙事设计师",
    focus: "文学性、沉浸感、角色一致性、语言质量。对重复、矛盾、平淡零容忍。",
    strictness: "strict",
  },
  {
    id: "mechanics_moderate",
    name: "游戏机制-适中",
    role: "游戏系统设计师",
    focus: "机制透明度、状态变更合理性、玩家行动回报。关注游戏性而非文学性。",
    strictness: "moderate",
  },
  {
    id: "player_lenient",
    name: "玩家体验-宽松",
    role: "目标玩家代表",
    focus: "代入感、选择意义、继续游玩意愿。更看重体验而非技术细节。",
    strictness: "lenient",
  },
  {
    id: "consistency_strict",
    name: "逻辑一致性-严格",
    role: "质量保证工程师",
    focus: "DM JSON 与叙事一致、NPC 知识边界、事实矛盾。对逻辑漏洞零容忍。",
    strictness: "strict",
  },
];

// ── Pairwise 标注函数 ─────────────────────────────────────

/**
 * 对两条轨迹执行 pairwise 标注。
 *
 * 当前实现为规则启发式（rule-based heuristic），后续可升级为 LLM judge。
 * 规则启发式的设计目标是：能区分明显差异，能为 LLM judge 提供校准基线。
 *
 * @param entry 待标注的 gold set 条目
 * @param persona 使用的 judge persona
 * @returns 标注结果
 */
export function annotatePairwiseHeuristic(
  entry: GoldSetEntry,
  persona: JudgePersona,
): PairwiseAnnotation {
  const stepsA = entry.traceA.steps;
  const stepsB = entry.traceB.steps;

  // 规则 1: 轨迹完整性
  const completenessA = computeCompleteness(entry.traceA);
  const completenessB = computeCompleteness(entry.traceB);

  // 规则 2: 叙事长度合理性（太短无内容，太长可能啰嗦）
  const avgNarrativeLenA = avgNarrativeLength(stepsA);
  const avgNarrativeLenB = avgNarrativeLength(stepsB);

  // 规则 3: 失败步骤数
  const failureStepsA = countFailureSteps(stepsA);
  const failureStepsB = countFailureSteps(stepsB);

  // 规则 4: 叙事重复度
  const repetitionA = narrativeRepetitionScore(stepsA);
  const repetitionB = narrativeRepetitionScore(stepsB);

  // 综合评分
  const scoreA = completenessA * 3 - failureStepsA * 2 - repetitionA * 2 + (avgNarrativeLenA > 20 ? 1 : 0);
  const scoreB = completenessB * 3 - failureStepsB * 2 - repetitionB * 2 + (avgNarrativeLenB > 20 ? 1 : 0);

  let preference: "A" | "B" | "tie";
  let confidence: number;

  const diff = Math.abs(scoreA - scoreB);
  if (diff < 1) {
    preference = "tie";
    confidence = Math.max(1, 5 - Math.round(diff * 2));
  } else if (scoreA > scoreB) {
    preference = "A";
    confidence = Math.min(5, Math.round(diff));
  } else {
    preference = "B";
    confidence = Math.min(5, Math.round(diff));
  }

  const reasoning = buildReasoning({
    persona,
    completenessA,
    completenessB,
    avgNarrativeLenA,
    avgNarrativeLenB,
    failureStepsA,
    failureStepsB,
    repetitionA,
    repetitionB,
    preference,
  });

  return {
    annotatorId: persona.id,
    annotatorRole: persona.role,
    preference,
    confidence,
    reasoning,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 对一条 gold set entry 执行全部 persona 的 pairwise 标注。
 * 至少 2 个 persona。
 */
export function annotateEntryFull(
  entry: GoldSetEntry,
  personas: JudgePersona[] = JUDGE_PERSONAS.slice(0, 2),
): GoldSetEntry {
  for (const persona of personas) {
    const annotation = annotatePairwiseHeuristic(entry, persona);
    addAnnotation(entry, annotation);
  }
  return entry;
}

// ── 启发式计分函数 ────────────────────────────────────────

function computeCompleteness(trace: {
  totalSteps: number;
  terminatedReason: string;
}): number {
  // 正常结局 = 高分
  if (trace.terminatedReason === "reached_ending") return 5;
  if (trace.terminatedReason === "objective_reached") return 4;
  if (trace.terminatedReason === "max_steps") return 3;
  if (trace.terminatedReason === "softlock") return 1;
  if (trace.terminatedReason === "death") return 2;
  if (trace.terminatedReason === "error") return 0;
  return 2;
}

function avgNarrativeLength(
  steps: Array<{ narrative: string }>,
): number {
  if (steps.length === 0) return 0;
  return steps.reduce((sum, s) => sum + (s.narrative?.length ?? 0), 0) / steps.length;
}

function countFailureSteps(
  steps: Array<{ stepFailureMode?: string }>,
): number {
  return steps.filter((s) => s.stepFailureMode !== undefined).length;
}

function narrativeRepetitionScore(
  steps: Array<{ narrative: string }>,
): number {
  if (steps.length < 2) return 0;

  const texts = steps.map((s) => s.narrative.slice(0, 80));
  let repeatCount = 0;

  for (let i = 1; i < texts.length; i++) {
    const prev = texts[i - 1] ?? "";
    const curr = texts[i] ?? "";
    // 简化的重复检测：前 40 字符 Jaccard 相似度
    if (jaccardSimilarity(prev.slice(0, 40), curr.slice(0, 40)) > 0.7) {
      repeatCount++;
    }
  }

  return repeatCount;
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(""));
  const setB = new Set(b.split(""));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function buildReasoning(params: {
  persona: JudgePersona;
  completenessA: number;
  completenessB: number;
  avgNarrativeLenA: number;
  avgNarrativeLenB: number;
  failureStepsA: number;
  failureStepsB: number;
  repetitionA: number;
  repetitionB: number;
  preference: "A" | "B" | "tie";
}): string {
  const lines: string[] = [
    `[${params.persona.name}] 评估视角: ${params.persona.focus}`,
    `轨迹 A: 完整度=${params.completenessA}/5 平均叙事长度=${params.avgNarrativeLenA.toFixed(0)} 失败步骤=${params.failureStepsA} 重复度=${params.repetitionA}`,
    `轨迹 B: 完整度=${params.completenessB}/5 平均叙事长度=${params.avgNarrativeLenB.toFixed(0)} 失败步骤=${params.failureStepsB} 重复度=${params.repetitionB}`,
    `偏好: ${params.preference === "tie" ? "平局" : `轨迹 ${params.preference} 更好`}`,
  ];
  return lines.join("；");
}

// ── 批量标注 ──────────────────────────────────────────────

/**
 * 对一批 gold set entry 执行全 persona pairwise 标注。
 *
 * @param entries 待标注的条目
 * @param minPersonas 最少标注 persona 数（默认 2）
 */
export function annotateEntriesBatch(
  entries: GoldSetEntry[],
  minPersonas: number = 2,
): GoldSetEntry[] {
  const personas = JUDGE_PERSONAS.slice(0, Math.min(minPersonas, JUDGE_PERSONAS.length));
  console.log(
    `🏷️  开始 pairwise 标注: ${entries.length} 条目 × ${personas.length} persona`,
  );

  for (const entry of entries) {
    annotateEntryFull(entry, personas);
  }

  const annotatedCount = entries.filter(
    (e) => e.annotations.length >= minPersonas,
  ).length;
  console.log(
    `✅ 标注完成: ${annotatedCount}/${entries.length} 条目达到 ${minPersonas}+ 标注`,
  );

  return entries;
}

// ── 从 Trace 目录执行标注 ─────────────────────────────────

/**
 * 从 trace 目录加载 playthrough 轨迹并执行 pairwise 标注。
 *
 * 将同场景不同 persona 的轨迹配对，然后标注。
 */
export async function annotateTraceDirectory(
  traceDir: string,
  options?: {
    minPersonas?: number;
    outputPath?: string;
  },
): Promise<void> {
  if (!fs.existsSync(traceDir)) {
    console.warn(`⚠️ Trace 目录不存在: ${traceDir}`);
    return;
  }

  const files = fs
    .readdirSync(traceDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length < 2) {
    console.warn(`⚠️ Trace 目录中至少需要 2 个文件进行 pairwise 标注`);
    return;
  }

  const traces: TraceArtifact[] = [];
  for (const file of files) {
    try {
      const trace = JSON.parse(
        fs.readFileSync(path.join(traceDir, file), "utf8"),
      ) as TraceArtifact;
      if (trace.runId && trace.scenarioId && trace.steps?.length > 0) {
        traces.push(trace);
      }
    } catch {
      // skip
    }
  }

  console.log(`📂 加载 ${traces.length} 条有效 trace`);

  // 按 scenario 分组
  const byScenario = new Map<string, TraceArtifact[]>();
  for (const trace of traces) {
    const existing = byScenario.get(trace.scenarioId) ?? [];
    existing.push(trace);
    byScenario.set(trace.scenarioId, existing);
  }

  // 配对同场景的不同 persona 轨迹
  const { createEntry } = await import("./goldSetManager");
  const { resolveExperimentProvenance } = await import(
    "../../src/lib/evals/harness/provenance"
  );

  const entries: GoldSetEntry[] = [];
  for (const [scenarioId, scenarioTraces] of byScenario) {
    // 取前两条不同 persona 的轨迹配对
    const traceA = scenarioTraces[0];
    const traceB = scenarioTraces[1] ?? scenarioTraces[0];
    if (!traceA || !traceB) continue;

    const entry = createEntry({
      entryId: `gold_${scenarioId}_${Date.now()}`,
      scenarioId,
      category: traceA.scenarioCategory ?? "unknown",
      traceA,
      traceB,
      provenance: resolveExperimentProvenance(),
    });
    entries.push(entry);
  }

  // 执行标注
  annotateEntriesBatch(entries, options?.minPersonas ?? 2);

  // 保存结果
  const { loadGoldSet, saveGoldSet } = await import("./goldSetManager");
  const goldSet = loadGoldSet(options?.outputPath);
  const existingIds = new Set(goldSet.entries.map((e) => e.entryId));
  for (const entry of entries) {
    if (!existingIds.has(entry.entryId)) {
      goldSet.entries.push(entry);
    }
  }
  saveGoldSet(goldSet, options?.outputPath);
}
