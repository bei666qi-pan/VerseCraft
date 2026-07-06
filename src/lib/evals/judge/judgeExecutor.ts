/**
 * Judge 执行引擎
 *
 * 负责：
 * 1. 调用 AI 服务执行 LLM-as-Judge 评分
 * 2. 解析 judge 输出为结构化分数
 * 3. 多裁判聚合（中位数、共识、投票）
 * 4. 位置随机化去偏见
 */

import { buildJudgePrompt } from "./judgePrompt";
import {
  type JudgeDimension,
  type JudgeIssue,
  type JudgeRubric,
  type JudgeRunConfig,
  type JudgeRunSummary,
  type JudgeTarget,
  type JudgeVerdict,
  type MultiJudgeResult,
  type PositionScheme,
  generatePositionScheme,
  interJudgeAgreement,
  median,
  variance,
} from "./types";

// === Judge 输出解析 ===

interface ParsedJudgeOutput {
  dimensionScores: Record<string, number>;
  overallScore: number;
  passed: boolean;
  reasoning: string;
  issues: JudgeIssue[];
  highlights: string[];
}

function parseJudgeJsonOutput(rawText: string, rubric: JudgeRubric): ParsedJudgeOutput | null {
  // 清理可能的 markdown 代码块包装
  let jsonStr = rawText.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // 尝试找到 JSON 对象
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    // 验证必填字段
    const dimensionScores = parsed.dimensionScores as Record<string, number> | undefined;
    if (!dimensionScores || typeof dimensionScores !== "object") return null;

    // 确保所有维度都有分数
    for (const dim of rubric.dimensions) {
      if (typeof dimensionScores[dim.id] !== "number") {
        dimensionScores[dim.id] = 3; // 默认及格分
      }
      // 截断到 1-5
      dimensionScores[dim.id] = Math.max(1, Math.min(5, Math.round(dimensionScores[dim.id]!)));
    }

    const issues: JudgeIssue[] = Array.isArray(parsed.issues)
      ? parsed.issues.filter(
          (i): i is Record<string, unknown> =>
            typeof i === "object" && i !== null && typeof i.dimension === "string"
        ).map((i) => ({
          dimension: String(i.dimension),
          severity: (["critical", "major", "minor"].includes(String(i.severity)) ? String(i.severity) : "minor") as JudgeIssue["severity"],
          description: String(i.description ?? ""),
          evidence: typeof i.evidence === "string" ? i.evidence : undefined,
        }))
      : [];

    const highlights: string[] = Array.isArray(parsed.highlights)
      ? parsed.highlights.filter((h): h is string => typeof h === "string")
      : [];

    // 计算加权总分
    const overallScore = Math.max(1, Math.min(5,
      typeof parsed.overallScore === "number"
        ? Math.round(parsed.overallScore * 10) / 10
        : computeWeightedAverage(dimensionScores, rubric.dimensions)
    ));

    const passed = checkPassed(dimensionScores, overallScore, rubric);

    return {
      dimensionScores,
      overallScore,
      passed,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      issues,
      highlights,
    };
  } catch {
    return null;
  }
}

function computeWeightedAverage(scores: Record<string, number>, dimensions: JudgeDimension[]): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const dim of dimensions) {
    const score = scores[dim.id] ?? 3;
    weightedSum += score * dim.weight;
    totalWeight += dim.weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 3;
}

function checkPassed(
  scores: Record<string, number>,
  overallScore: number,
  rubric: JudgeRubric
): boolean {
  // 硬性失败条件
  if (rubric.passRule.hardFailIf) {
    for (const [dimId, threshold] of Object.entries(rubric.passRule.hardFailIf)) {
      const score = scores[dimId];
      if (score !== undefined && score <= threshold) return false;
    }
  }

  // 每个维度最低分
  if (rubric.passRule.minEach !== undefined) {
    for (const dim of rubric.dimensions) {
      const score = scores[dim.id];
      if (score !== undefined && score < rubric.passRule.minEach) return false;
    }
  }

  // 加权平均
  if (overallScore < rubric.passRule.minAverage) return false;

  return true;
}

// === 核心 Judge 执行函数（纯逻辑，不含 LLM 调用） ===

export interface ExecuteJudgeInput {
  rubric: JudgeRubric;
  target: JudgeTarget;
  /** Judge 输出的原始文本（由 AI 服务调用方提供） */
  rawJudgeOutput: string;
  judgeModel: string;
  judgeRole: string;
  positionScheme: PositionScheme;
}

export function parseJudgeVerdict(input: ExecuteJudgeInput): JudgeVerdict | null {
  const parsed = parseJudgeJsonOutput(input.rawJudgeOutput, input.rubric);
  if (!parsed) return null;

  return {
    judgeModel: input.judgeModel,
    judgeRole: input.judgeRole,
    dimensionScores: parsed.dimensionScores,
    overallScore: parsed.overallScore,
    passed: parsed.passed,
    reasoning: parsed.reasoning,
    issues: parsed.issues,
    highlights: parsed.highlights,
    timestamp: Date.now(),
  };
}

// === 多裁判聚合 ===

export interface AggregateMultiJudgeInput {
  caseId: string;
  scenario: string;
  verdicts: JudgeVerdict[];
  rubric: JudgeRubric;
}

export function aggregateMultiJudge(input: AggregateMultiJudgeInput): MultiJudgeResult {
  const { caseId, scenario, verdicts, rubric } = input;
  const validVerdicts = verdicts.filter((v) => v !== null && v !== undefined);

  if (validVerdicts.length === 0) {
    return {
      caseId,
      scenario,
      verdicts: [],
      consensusScores: {},
      consensusOverall: 0,
      interJudgeAgreement: 0,
      passed: false,
      voteCount: { pass: 0, fail: 0, total: 0 },
      commonIssues: [],
      dimensionVariance: {},
    };
  }

  // 各维度共识分（中位数）
  const consensusScores: Record<string, number> = {};
  const dimensionVariance: Record<string, number> = {};

  for (const dim of rubric.dimensions) {
    const scores = validVerdicts
      .map((v) => v.dimensionScores[dim.id])
      .filter((s): s is number => typeof s === "number");
    consensusScores[dim.id] = median(scores);
    dimensionVariance[dim.id] = variance(scores);
  }

  // 综合共识分（加权平均的中位数）
  const overallScores = validVerdicts.map((v) => v.overallScore);
  const consensusOverall = median(overallScores);

  // 裁判间一致性
  const scoreMatrix = rubric.dimensions.map((dim) =>
    validVerdicts.map((v) => v.dimensionScores[dim.id] ?? 3)
  );
  const agreement = interJudgeAgreement(scoreMatrix);

  // 投票
  const passVotes = validVerdicts.filter((v) => v.passed).length;
  const failVotes = validVerdicts.length - passVotes;
  const passed = passVotes > failVotes;

  // 共同发现的问题（>= 2 个 judge 都提到）
  const issueMap = new Map<string, { issue: JudgeIssue; count: number }>();
  for (const v of validVerdicts) {
    for (const issue of v.issues) {
      // 用 dimension + description 前30字做去重 key
      const key = `${issue.dimension}:${issue.description.slice(0, 30)}`;
      const existing = issueMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        issueMap.set(key, { issue, count: 1 });
      }
    }
  }
  const commonIssues = [...issueMap.values()]
    .filter((entry) => entry.count >= 2)
    .map((entry) => entry.issue);

  return {
    caseId,
    scenario,
    verdicts: validVerdicts,
    consensusScores,
    consensusOverall,
    interJudgeAgreement: agreement,
    passed,
    voteCount: { pass: passVotes, fail: failVotes, total: validVerdicts.length },
    commonIssues,
    dimensionVariance,
  };
}

// === 批次运行摘要 ===

export function summarizeJudgeRun(
  results: MultiJudgeResult[],
  config: JudgeRunConfig,
  durationMs: number
): JudgeRunSummary {
  const totalCases = results.length;
  const passedCases = results.filter((r) => r.passed).length;
  const failedCases = totalCases - passedCases;
  const passRate = totalCases > 0 ? passedCases / totalCases : 0;

  // 各维度平均分
  const dimensionAverages: Record<string, number> = {};
  const allDimIds = new Set<string>();
  for (const r of results) {
    for (const dimId of Object.keys(r.consensusScores)) {
      allDimIds.add(dimId);
    }
  }
  for (const dimId of allDimIds) {
    const scores = results
      .map((r) => r.consensusScores[dimId])
      .filter((s): s is number => typeof s === "number");
    dimensionAverages[dimId] = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
  }

  // 平均分
  const allOverallScores = results.map((r) => r.consensusOverall);
  const averageScore = allOverallScores.length > 0
    ? allOverallScores.reduce((a, b) => a + b, 0) / allOverallScores.length
    : 0;

  // 裁判间一致性平均
  const agreements = results.map((r) => r.interJudgeAgreement);
  const interJudgeAgreementAvg = agreements.length > 0
    ? agreements.reduce((a, b) => a + b, 0) / agreements.length
    : 0;

  // 高争议案例（任意维度方差 > 1.0）
  const highDisagreementCases = results
    .filter((r) => Object.values(r.dimensionVariance).some((v) => v > 1.0))
    .map((r) => r.caseId);

  // Gate 判定
  const gatePass = passRate >= 0.9 && averageScore >= config.rubricId.includes("safety")
    ? 4.0
    : 3.5;

  return {
    config,
    totalCases,
    passedCases,
    failedCases,
    passRate,
    averageScore,
    dimensionAverages,
    interJudgeAgreementAvg,
    highDisagreementCases,
    results,
    durationMs,
    gatePass,
  };
}

// === 批量 Judge Prompt 构建器 ===

export interface BuildBatchJudgePromptsInput {
  rubric: JudgeRubric;
  targets: JudgeTarget[];
  numJudges: number;
  positionRandomization: boolean;
}

export interface JudgePromptBatch {
  /** 每个 target 的每个 judge 的任务 */
  tasks: JudgeTask[];
}

export interface JudgeTask {
  caseId: string;
  judgeIndex: number;
  positionScheme: PositionScheme;
  systemPrompt: string;
  userPrompt: string;
}

export function buildBatchJudgePrompts(input: BuildBatchJudgePromptsInput): JudgePromptBatch {
  const { rubric, targets, numJudges, positionRandomization } = input;
  const tasks: JudgeTask[] = [];

  for (const target of targets) {
    for (let judgeIdx = 0; judgeIdx < numJudges; judgeIdx++) {
      const positionScheme = positionRandomization
        ? generatePositionScheme((target.caseId.length + judgeIdx) * 7)
        : "original";

      const prompt = buildJudgePrompt({
        rubric,
        target,
        positionScheme,
        chainOfThought: true,
      });

      tasks.push({
        caseId: target.caseId,
        judgeIndex: judgeIdx,
        positionScheme,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
      });
    }
  }

  return { tasks };
}

// === 无 LLM 的纯函数评估（fallback / 离线模式） ===

export interface OfflineJudgeInput {
  rubric: JudgeRubric;
  target: JudgeTarget;
}

export function evaluateOffline(input: OfflineJudgeInput): JudgeVerdict {
  const { rubric, target } = input;
  const scores: Record<string, number> = {};
  const issues: JudgeIssue[] = [];
  const highlights: string[] = [];

  for (const dim of rubric.dimensions) {
    // 基于简单启发式评估
    let score = 3; // 默认及格

    switch (dim.id) {
      case "literary_quality":
        // 基于叙事长度和字符多样性粗略评估
        if (target.narrativeChars >= 300 && target.narrativeChars <= 900) score = 4;
        else if (target.narrativeChars >= 180) score = 3;
        else if (target.narrativeChars < 100) score = 2;
        break;
      case "canon_consistency":
        // 检查是否有系统提示词泄漏
        if (target.narrative.includes("系统提示词") || target.narrative.includes("JSON解析")) {
          score = 1;
          issues.push({
            dimension: dim.id,
            severity: "critical",
            description: "叙事中包含系统提示词泄漏",
            evidence: target.narrative.slice(0, 100),
          });
        }
        break;
      default:
        // 其他维度保持默认 3 分
        break;
    }

    scores[dim.id] = score;
    if (score >= 4) highlights.push(`${dim.name}：表现良好`);
  }

  const overallScore = computeWeightedAverage(scores, rubric.dimensions);
  const passed = checkPassed(scores, overallScore, rubric);

  return {
    judgeModel: "offline_heuristic",
    judgeRole: "offline",
    dimensionScores: scores,
    overallScore,
    passed,
    reasoning: "离线启发式评估（非LLM）",
    issues,
    highlights,
    timestamp: Date.now(),
  };
}
