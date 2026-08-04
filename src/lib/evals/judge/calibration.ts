/**
 * Judge 校准管线 — Spearman / Cohen's Kappa 计算
 *
 * 设计原则：
 * - judge 不自证正确，必须用 gold set 校准
 * - 提供 Spearman 秩相关系数（排序一致性）和 Cohen's Kappa（分类一致性）
 * - mock 模式只做契约硬门；live judge 必须经校准才能用于质量判定
 * - 所有计算函数为纯函数，不访问 IO/DB/AI
 */

// ── Spearman 秩相关系数 ───────────────────────────────────

/**
 * 计算两个数组之间的 Spearman 秩相关系数。
 *
 * 用于衡量 judge 打分与 gold set 真值的排序一致性。
 * 值域 [-1, 1]，≥ 0.7 为可接受，≥ 0.8 为良好。
 */
export function spearmanRho(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`数组长度不匹配: ${a.length} vs ${b.length}`);
  }
  if (a.length < 3) {
    return a.length === 0 ? 0 : (a[0] === b[0] ? 1 : 0);
  }

  const rankA = computeRanks(a);
  const rankB = computeRanks(b);

  const n = rankA.length;
  let d2Sum = 0;
  for (let i = 0; i < n; i++) {
    d2Sum += (rankA[i]! - rankB[i]!) ** 2;
  }

  // Spearman formula: 1 - (6 * Σd²) / (n * (n² - 1))
  return 1 - (6 * d2Sum) / (n * (n * n - 1));
}

/** 计算数组的值排名（1-based，平局取平均排名） */
function computeRanks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    // 找出平局段
    while (j + 1 < indexed.length && indexed[j + 1]!.value === indexed[i]!.value) {
      j++;
    }
    // 平局段取平均排名
    const avgRank = (i + j + 2) / 2; // 1-based
    for (let k = i; k <= j; k++) {
      ranks[indexed[k]!.index!] = avgRank;
    }
    i = j + 1;
  }

  return ranks;
}

// ── Cohen's Kappa ─────────────────────────────────────────

/**
 * 计算 Cohen's Kappa 系数。
 *
 * 用于衡量两个 judge 之间（或 judge 与 gold set 之间）的分类一致性。
 * 值域 [-1, 1]：
 * - ≥ 0.81 几乎完全一致
 * - 0.61–0.80 高度一致
 * - 0.41–0.60 中等一致
 * - 0.21–0.40 一般一致
 * - < 0.21 低一致
 */
export function cohensKappa(
  judgeScores: number[],
  goldScores: number[],
  numCategories: number = 5,
): number {
  if (judgeScores.length !== goldScores.length) {
    throw new Error(`数组长度不匹配: ${judgeScores.length} vs ${goldScores.length}`);
  }
  if (judgeScores.length === 0) return 1; // vacuous agreement

  // 将连续分数离散化为类别
  const judgeCats = discretize(judgeScores, numCategories);
  const goldCats = discretize(goldScores, numCategories);

  // 构建混淆矩阵
  const matrix: number[][] = Array.from({ length: numCategories }, () =>
    new Array<number>(numCategories).fill(0),
  );

  for (let i = 0; i < judgeCats.length; i++) {
    matrix[judgeCats[i]!]![goldCats[i]!]!++;
  }

  const n = judgeCats.length;

  // 观察一致性
  let po = 0;
  for (let k = 0; k < numCategories; k++) {
    po += matrix[k]![k]!;
  }
  po /= n;

  // 期望一致性
  let pe = 0;
  for (let k = 0; k < numCategories; k++) {
    const rowSum = matrix[k]!.reduce((a, b) => a + b, 0);
    const colSum = matrix.reduce((sum, row) => sum + (row[k] ?? 0), 0);
    pe += (rowSum * colSum) / (n * n);
  }

  if (pe === 1) return 1;
  return (po - pe) / (1 - pe);
}

/** 将连续值离散化为类别 0..numCategories-1 */
function discretize(values: number[], numCategories: number): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v) =>
    Math.min(numCategories - 1, Math.floor(((v - min) / range) * numCategories)),
  );
}

// ── 校准结果类型 ──────────────────────────────────────────

/** 单维度校准结果 */
export interface DimensionCalibration {
  dimension: string;
  spearmanRho: number;
  cohensKappa: number;
  sampleCount: number;
  /** judge 平均分 */
  judgeMean: number;
  /** gold 平均分 */
  goldMean: number;
  /** 校准偏移 (goldMean - judgeMean)，正值表示 judge 偏严格 */
  calibrationBias: number;
  /** 校准质量：good / acceptable / poor */
  calibrationQuality: "good" | "acceptable" | "poor";
}

/** 完整校准报告 */
export interface CalibrationReport {
  /** 校准时间 */
  calibratedAt: string;
  /** 校准样本总数 */
  totalSamples: number;
  /** 各维度校准结果 */
  dimensions: DimensionCalibration[];
  /** 综合 Spearman（所有维度分数拼接后计算） */
  overallSpearman: number;
  /** 综合 Cohen's Kappa */
  overallKappa: number;
  /** 整体校准质量 */
  overallQuality: "good" | "acceptable" | "poor";
  /** 建议：是否需要重新校准 */
  recommendation: string;
}

// ── 校准执行 ──────────────────────────────────────────────

/**
 * 执行 judge 校准。
 *
 * @param dimensions 各维度的 (judge分数[], gold分数[]) 映射
 * @returns 校准报告
 */
export function calibrateJudge(
  dimensions: Record<string, { judgeScores: number[]; goldScores: number[] }>,
): CalibrationReport {
  const dimResults: DimensionCalibration[] = [];
  let totalSamples = 0;
  let allJudge: number[] = [];
  let allGold: number[] = [];

  for (const [dimension, { judgeScores, goldScores }] of Object.entries(dimensions)) {
    if (judgeScores.length !== goldScores.length) {
      throw new Error(`维度 ${dimension} 的 judge/gold 数组长度不匹配`);
    }
    if (judgeScores.length === 0) continue;

    const rho = spearmanRho(judgeScores, goldScores);
    const kappa = cohensKappa(judgeScores, goldScores);
    const judgeMean = judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length;
    const goldMean = goldScores.reduce((a, b) => a + b, 0) / goldScores.length;
    const bias = goldMean - judgeMean;

    const quality = rho >= 0.8 ? "good" : rho >= 0.7 ? "acceptable" : "poor";

    dimResults.push({
      dimension,
      spearmanRho: rho,
      cohensKappa: kappa,
      sampleCount: judgeScores.length,
      judgeMean,
      goldMean,
      calibrationBias: bias,
      calibrationQuality: quality,
    });

    totalSamples = Math.max(totalSamples, judgeScores.length);
    allJudge = allJudge.concat(judgeScores);
    allGold = allGold.concat(goldScores);
  }

  const overallRho = allJudge.length >= 3 ? spearmanRho(allJudge, allGold) : 0;
  const overallKappa = allJudge.length >= 2 ? cohensKappa(allJudge, allGold) : 1;
  const overallQuality =
    overallRho >= 0.8 ? "good" : overallRho >= 0.7 ? "acceptable" : "poor";

  let recommendation: string;
  if (overallQuality === "good") {
    recommendation = "校准通过 — judge 可直接用于质量判定";
  } else if (overallQuality === "acceptable") {
    recommendation = "校准可接受 — judge 可用于相对排序，不应用于绝对值判定；建议增加校准样本";
  } else {
    recommendation = "校准不足 — judge 与 gold set 一致性过低，不应独立用于质量判定；需增加 gold set 样本或审查 judge rubric";
  }

  return {
    calibratedAt: new Date().toISOString(),
    totalSamples,
    dimensions: dimResults,
    overallSpearman: overallRho,
    overallKappa,
    overallQuality,
    recommendation,
  };
}

// ── DeepEval 校准集成 ─────────────────────────────────────

/**
 * 从 DeepEval 评测结果生成校准数据。
 *
 * DeepEval 的 GEval 输出包含各维度分数，可与此处的 gold set 对齐。
 *
 * @param deepEvalScores DeepEval GEval 各维度分数 { [dimension]: { [sampleId]: score } }
 * @param goldScores Gold set 各维度分数 { [dimension]: { [sampleId]: score } }
 */
export function alignDeepEvalWithGoldSet(
  deepEvalScores: Record<string, Record<string, number>>,
  goldScores: Record<string, Record<string, number>>,
): Record<string, { judgeScores: number[]; goldScores: number[] }> {
  const aligned: Record<string, { judgeScores: number[]; goldScores: number[] }> = {};

  for (const dimension of Object.keys(goldScores)) {
    const judge = deepEvalScores[dimension] ?? {};
    const gold = goldScores[dimension] ?? {};
    const judgeArr: number[] = [];
    const goldArr: number[] = [];

    for (const sampleId of Object.keys(gold)) {
      if (sampleId in judge) {
        judgeArr.push(judge[sampleId]!);
        goldArr.push(gold[sampleId]!);
      }
    }

    if (judgeArr.length >= 3) {
      aligned[dimension] = { judgeScores: judgeArr, goldScores: goldArr };
    }
  }

  return aligned;
}

// ── 校准是否有效的判断 ────────────────────────────────────

/** 判断 judge 是否已校准并可用于 live 质量判定 */
export function isJudgeCalibrated(report: CalibrationReport): boolean {
  return report.overallQuality !== "poor" && report.totalSamples >= 10;
}

/** 判断 judge 是否只能用于相对排序（不可用于绝对质量判定） */
export function isJudgeRelativeOnly(report: CalibrationReport): boolean {
  return report.overallQuality === "acceptable" || report.totalSamples < 30;
}
