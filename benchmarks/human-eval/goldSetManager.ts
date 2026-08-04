/**
 * Gold Set Manager — Gold Set 集合管理器
 *
 * 职责：
 * - 从文件加载/保存 GoldSetFile
 * - 添加/更新条目
 * - 计算元数据统计
 * - 导出校准样本
 * - 版本管理
 */

import fs from "node:fs";
import path from "node:path";

import type {
  GoldSetEntry,
  GoldSetFile,
  GoldSetMetadata,
  PairwiseAnnotation,
  CalibrationSample,
} from "./goldSetTypes";
import type { ExperimentProvenance } from "../../src/lib/evals/harness/types";
import type { TraceArtifact } from "../../src/lib/evals/playthrough/orchestrator";

// ── 文件路径 ──────────────────────────────────────────────

const DEFAULT_GOLD_SET_PATH = path.resolve(
  "benchmarks/human-eval/gold-set.json",
);

// ── 加载 / 保存 ───────────────────────────────────────────

/** 加载 gold set 文件 */
export function loadGoldSet(filePath?: string): GoldSetFile {
  const resolved = filePath ?? DEFAULT_GOLD_SET_PATH;
  if (!fs.existsSync(resolved)) {
    return { metadata: createEmptyMetadata(), entries: [] };
  }
  const content = fs.readFileSync(resolved, "utf8");
  return JSON.parse(content) as GoldSetFile;
}

/** 保存 gold set 文件 */
export function saveGoldSet(goldSet: GoldSetFile, filePath?: string): void {
  const resolved = filePath ?? DEFAULT_GOLD_SET_PATH;
  goldSet.metadata = computeMetadata(goldSet.entries);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(goldSet, null, 2), "utf8");
  console.log(
    `✅ Gold set 已保存: ${resolved} (${goldSet.entries.length} 条)`,
  );
}

// ── 条目管理 ──────────────────────────────────────────────

/** 创建新条目 */
export function createEntry(params: {
  entryId: string;
  scenarioId: string;
  category: string;
  traceA: TraceArtifact;
  traceB: TraceArtifact;
  provenance: ExperimentProvenance;
}): GoldSetEntry {
  return {
    entryId: params.entryId,
    scenarioId: params.scenarioId,
    category: params.category,
    traceA: {
      runId: params.traceA.runId,
      persona: params.traceA.persona,
      seed: params.traceA.seed,
      steps: params.traceA.steps.map((s) => ({
        stepIndex: s.stepIndex,
        playerAction: s.playerAction,
        narrative: s.narrative,
        stateSnapshot: s.stateSnapshot,
        dmJson: s.dmJson,
        metrics: s.metrics as {
          firstTokenMs?: number;
          finalMs?: number;
          longGapCount?: number;
        },
      })),
      initialState: params.traceA.initialState,
      finalState:
        (params.traceA as Record<string, unknown>)
          .finalState as GoldSetEntry["traceA"]["finalState"],
      terminatedReason: params.traceA.terminatedReason,
      totalSteps: params.traceA.totalSteps,
      durationMs: params.traceA.durationMs,
    },
    traceB: {
      runId: params.traceB.runId,
      persona: params.traceB.persona,
      seed: params.traceB.seed,
      steps: params.traceB.steps.map((s) => ({
        stepIndex: s.stepIndex,
        playerAction: s.playerAction,
        narrative: s.narrative,
        stateSnapshot: s.stateSnapshot,
        dmJson: s.dmJson,
        metrics: s.metrics as {
          firstTokenMs?: number;
          finalMs?: number;
          longGapCount?: number;
        },
      })),
      initialState: params.traceB.initialState,
      finalState:
        (params.traceB as Record<string, unknown>)
          .finalState as GoldSetEntry["traceB"]["finalState"],
      terminatedReason: params.traceB.terminatedReason,
      totalSteps: params.traceB.totalSteps,
      durationMs: params.traceB.durationMs,
    },
    annotations: [],
    consensusPreference: "tie",
    agreementScore: 0,
    disputed: false,
    createdAt: new Date().toISOString(),
    provenance: params.provenance,
  };
}

/** 给条目添加标注 */
export function addAnnotation(
  entry: GoldSetEntry,
  annotation: PairwiseAnnotation,
): void {
  entry.annotations.push(annotation);
  // 重新计算共识
  updateConsensus(entry);
}

/** 从多条标注计算共识 */
export function updateConsensus(entry: GoldSetEntry): void {
  if (entry.annotations.length === 0) {
    entry.consensusPreference = "tie";
    entry.agreementScore = 0;
    entry.disputed = false;
    return;
  }

  const counts = { A: 0, B: 0, tie: 0 };
  for (const a of entry.annotations) {
    counts[a.preference]++;
  }

  const total = entry.annotations.length;
  const maxCount = Math.max(counts.A, counts.B, counts.tie);
  const maxPreference =
    counts.A === maxCount
      ? ("A" as const)
      : counts.B === maxCount
        ? ("B" as const)
        : ("tie" as const);

  entry.consensusPreference = maxPreference;
  // 一致性：多数票比例
  entry.agreementScore = maxCount / total;
  // 争议：无人占多数
  entry.disputed = maxCount <= total / 2;
}

// ── 元数据计算 ────────────────────────────────────────────

function createEmptyMetadata(): GoldSetMetadata {
  return {
    version: "1.0.0",
    totalEntries: 0,
    disputedEntries: 0,
    annotators: [],
    categoryDistribution: {},
    consensusDistribution: { A: 0, B: 0, tie: 0 },
    averageAgreement: 0,
    lastUpdated: new Date().toISOString(),
  };
}

export function computeMetadata(entries: GoldSetEntry[]): GoldSetMetadata {
  const annotators = new Set<string>();
  const categoryDist: Record<string, number> = {};
  const consensusDist = { A: 0, B: 0, tie: 0 };
  let disputedCount = 0;
  let totalAgreement = 0;

  for (const entry of entries) {
    for (const a of entry.annotations) {
      annotators.add(a.annotatorId);
    }
    categoryDist[entry.category] = (categoryDist[entry.category] ?? 0) + 1;
    consensusDist[entry.consensusPreference]++;
    if (entry.disputed) disputedCount++;
    totalAgreement += entry.agreementScore;
  }

  return {
    version: "1.0.0",
    totalEntries: entries.length,
    disputedEntries: disputedCount,
    annotators: [...annotators].sort(),
    categoryDistribution: categoryDist,
    consensusDistribution: consensusDist,
    averageAgreement:
      entries.length > 0 ? totalAgreement / entries.length : 0,
    lastUpdated: new Date().toISOString(),
  };
}

// ── 校准样本导出 ──────────────────────────────────────────

/** 从 gold set 导出校准样本（供 judge 校准使用） */
export function exportCalibrationSamples(
  goldSet: GoldSetFile,
  options?: {
    /** 只导出非争议条目 */
    undisputedOnly?: boolean;
    /** 最大导出数 */
    maxSamples?: number;
  },
): CalibrationSample[] {
  let entries = goldSet.entries;

  if (options?.undisputedOnly) {
    entries = entries.filter((e) => !e.disputed);
  }

  if (options?.maxSamples && options.maxSamples > 0) {
    entries = entries.slice(0, options.maxSamples);
  }

  return entries.map((entry) => {
    // 取轨迹 A 的第一步叙事作为校准样本
    const firstStep = entry.traceA.steps[0];
    return {
      sampleId: entry.entryId,
      scenarioId: entry.scenarioId,
      scenario: entry.category,
      narrative: firstStep?.narrative ?? "",
      dmJson: (firstStep?.dmJson as Record<string, unknown>) ?? {},
      goldScore: entry.consensusPreference === "A" ? 5 : entry.consensusPreference === "B" ? 1 : 3,
      annotatorAgreement: entry.agreementScore,
      disputed: entry.disputed,
    };
  });
}

// ── 批量导入 ──────────────────────────────────────────────

/** 从 trace 目录批量导入 gold set */
export function importTracesFromDirectory(
  traceDir: string,
  provenance: ExperimentProvenance,
): GoldSetFile {
  const goldSet = loadGoldSet();
  const existingIds = new Set(goldSet.entries.map((e) => e.entryId));

  if (!fs.existsSync(traceDir)) {
    console.warn(`⚠️ Trace 目录不存在: ${traceDir}`);
    return goldSet;
  }

  const files = fs
    .readdirSync(traceDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let imported = 0;
  for (const file of files) {
    const tracePath = path.join(traceDir, file);
    try {
      const trace = JSON.parse(
        fs.readFileSync(tracePath, "utf8"),
      ) as TraceArtifact;

      if (!trace.runId || !trace.scenarioId) {
        console.warn(`⚠️ 跳过无效 trace: ${file}`);
        continue;
      }

      // 每个 trace 作为自引用条目（用于单 trace Likert 评分）
      const entryId = `gold_${trace.runId}`;
      if (existingIds.has(entryId)) continue;

      const entry = createEntry({
        entryId,
        scenarioId: trace.scenarioId,
        category: trace.scenarioCategory ?? "unknown",
        traceA: trace,
        traceB: trace, // 自引用
        provenance,
      });

      goldSet.entries.push(entry);
      existingIds.add(entryId);
      imported++;
    } catch (err) {
      console.warn(
        `⚠️ 读取 trace 失败: ${file} - ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (imported > 0) {
    goldSet.metadata = computeMetadata(goldSet.entries);
    console.log(`✅ 已从 ${traceDir} 导入 ${imported} 条 trace`);
  }

  return goldSet;
}
