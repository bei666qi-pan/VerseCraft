/**
 * eval:authenticity — 真实 AI 输出 judge（Phase 2 重构版）
 *
 * 使用 JudgeService（EVAL_JUDGE TaskType）替代旧的 fixture-lint scoreFixture 启发式。
 * - mock 模式：退化到 evaluateOffline 启发式（与原行为等价）
 * - live 模式：调用真实 AI judge
 *
 * 流程：
 * 1. 加载 fixture 文件（与原版本一致）
 * 2. 转换为 JudgeTarget
 * 3. 用 JudgeService.judgeMulti 进行多裁判评判
 * 4. 加载校准种子，计算校准偏移（live 模式）
 * 5. 输出 JSON + harness history
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JudgeService, getRubric } from "../src/lib/evals/judge";
import { parseEvalCli, evalLog, writeJson, appendHistory, resolveExperimentProvenance } from "../src/lib/evals/harness";
import { resolveEvalMode } from "../src/lib/evals/harness/config";
import { AUTHENTICITY_CALIBRATION_SEEDS } from "../benchmarks/judge/authenticityCalibrationSeeds";
import type { JudgeTarget, JudgeVerdict, MultiJudgeResult } from "../src/lib/evals/judge/types";

// === 类型 ===

interface AuthenticityResult {
  file: string;
  scenario: string;
  caseId: string;
  passed: boolean;
  consensusOverall: number;
  consensusScores: Record<string, number>;
  interJudgeAgreement: number;
  verdictCount: number;
  commonIssues: string[];
  highlights: string[];
}

interface AuthenticityReport {
  schema: "authenticity_eval_v2";
  generatedAt: string;
  rubricId: string;
  mode: "mock" | "live";
  total: number;
  pass: number;
  fail: number;
  passRate: number;
  averageScore: number;
  dimensionAverages: Record<string, number>;
  calibrationDrift: number | null;
  results: AuthenticityResult[];
}

// === 夹具转 JudgeTarget ===

interface Fixture {
  scenario: string;
  description?: string;
  latestUserInput: string;
  playerContext: string;
  activeNpcId?: string;
  expect?: {
    mustContainAny?: string[];
    mustNotContain?: string[];
  };
}

function fixtureToJudgeTarget(fixture: Fixture, fileIdx: number): JudgeTarget {
  return {
    caseId: `fixture_${fileIdx}_${fixture.scenario.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    scenario: fixture.description ?? fixture.scenario,
    userInput: fixture.latestUserInput ?? "",
    narrative: fixture.latestUserInput ?? "",
    narrativeChars: (fixture.latestUserInput ?? "").length,
    dmJson: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: fixture.latestUserInput ?? "",
      is_death: false,
    },
    options: [],
    gameContext: fixture.playerContext ?? "",
  };
}

// === 校准 ===

interface CalibrationResult {
  total: number;
  correct: number;
  falsePositives: number;
  falseNegatives: number;
  accuracy: number;
  drift: number;
  details: Array<{
    caseId: string;
    expectedPass: boolean;
    actualPass: boolean;
    match: boolean;
  }>;
}

function runCalibration(results: MultiJudgeResult[]): CalibrationResult {
  const expected = new Map<string, boolean>();
  for (const seed of AUTHENTICITY_CALIBRATION_SEEDS) {
    expected.set(seed.caseId, seed.caseId.startsWith("pass_"));
  }

  let correct = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const details: CalibrationResult["details"] = [];

  for (const result of results) {
    const expectedPass = expected.get(result.caseId);
    if (expectedPass === undefined) continue;

    const actualPass = result.passed;
    const match = expectedPass === actualPass;
    if (match) correct += 1;
    else if (expectedPass && !actualPass) falsePositives += 1;
    else falseNegatives += 1;

    details.push({ caseId: result.caseId, expectedPass, actualPass, match });
  }

  const total = details.length;
  const accuracy = total > 0 ? correct / total : 1;
  // Drift: 1 - accuracy (positive = judge is misaligned)
  const drift = 1 - accuracy;

  return { total, correct, falsePositives, falseNegatives, accuracy, drift, details };
}

// === 主函数 ===

async function main(): Promise<void> {
  const options = parseEvalCli();
  const mode = resolveEvalMode();
  const rubricId = "versecraft_authenticity_judge_v1";

  // 1. 加载 fixture
  const root = path.resolve(fileURLToPath(import.meta.url), "../..");
  const fixtureNames = [
    "major_npc_low_reveal_dialogue.json",
    "task_pressure_persona_dialogue.json",
    "actor_scoped_memory_boundary.json",
    "normal_action.json",
    "npc_dialogue.json",
    "item_interaction.json",
    "preflight_sensitive.json",
  ];
  const fixtureDir = path.join(root, "benchmarks", "chat-turns");

  const fixtureTargets: JudgeTarget[] = [];
  for (let idx = 0; idx < fixtureNames.length; idx++) {
    const filePath = path.join(fixtureDir, fixtureNames[idx]!);
    try {
      const fixture = JSON.parse(fs.readFileSync(filePath, "utf8")) as Fixture;
      fixtureTargets.push(fixtureToJudgeTarget(fixture, idx));
    } catch {
      evalLog(options, `skipping unreadable fixture: ${fixtureNames[idx]}`);
    }
  }

  // 2. 运行 judge
  const allTargets = [...fixtureTargets, ...AUTHENTICITY_CALIBRATION_SEEDS];
  const results: AuthenticityResult[] = [];
  const calResults: MultiJudgeResult[] = [];

  for (const target of allTargets) {
    const { result } = await JudgeService.judgeMulti({
      rubricId,
      target,
      config: {
        numJudges: 1, // Single judge for efficiency
        positionRandomization: false,
        chainOfThought: false,
        forceMock: mode === "mock",
        timeoutMs: 15_000,
      },
    });

    if (target.caseId.startsWith("pass_") || target.caseId.startsWith("fail_")) {
      calResults.push(result);
    }

    results.push({
      file: target.caseId.startsWith("fixture_") ? target.caseId : "calibration",
      scenario: target.scenario,
      caseId: target.caseId,
      passed: result.passed,
      consensusOverall: result.consensusOverall,
      consensusScores: result.consensusScores,
      interJudgeAgreement: result.interJudgeAgreement,
      verdictCount: result.voteCount.total,
      commonIssues: result.commonIssues.map((i) => `[${i.severity}] ${i.dimension}: ${i.description}`),
      highlights: result.verdicts.flatMap((v) => v.highlights),
    });

    evalLog(
      options,
      `${target.caseId}: ${result.passed ? "pass" : "fail"} overall=${result.consensusOverall.toFixed(1)} judges=${result.voteCount.total}`
    );
  }

  // 3. 校准分析
  const calibration = runCalibration(calResults);

  // 4. 汇总
  const passCount = results.filter((r) => r.passed).length;
  const total = results.length;
  const passRate = total > 0 ? passCount / total : 0;
  const averageScore =
    results.length > 0
      ? results.reduce((s, r) => s + r.consensusOverall, 0) / results.length
      : 0;

  // 维度平均
  const dimMap = new Map<string, number[]>();
  for (const r of results) {
    for (const [dimId, score] of Object.entries(r.consensusScores)) {
      const arr = dimMap.get(dimId) ?? [];
      arr.push(score);
      dimMap.set(dimId, arr);
    }
  }
  const dimensionAverages: Record<string, number> = {};
  for (const [dimId, scores] of dimMap) {
    dimensionAverages[dimId] =
      scores.reduce((s, v) => s + v, 0) / scores.length;
  }

  const report: AuthenticityReport = {
    schema: "authenticity_eval_v2",
    generatedAt: new Date().toISOString(),
    rubricId,
    mode,
    total,
    pass: passCount,
    fail: total - passCount,
    passRate,
    averageScore,
    dimensionAverages,
    calibrationDrift: calibration.details.length > 0 ? calibration.drift : null,
    results,
  };

  // 校准日志
  if (calibration.details.length > 0) {
    evalLog(
      options,
      `calibration: accuracy=${(calibration.accuracy * 100).toFixed(1)}% drift=${(calibration.drift * 100).toFixed(1)}% fp=${calibration.falsePositives} fn=${calibration.falseNegatives}`
    );
  }

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.jsonOut) {
    writeJson(options.jsonOut, report);
  }
  process.stdout.write(json);

  // 写入历史
  const provenance = resolveExperimentProvenance();
  appendHistory({
    suite: "authenticity",
    mode,
    total,
    pass: passCount,
    passRate,
    gate: report.passRate >= 0.8 ? "pass" : "fail",
    timestamp: report.generatedAt,
    gitSha: provenance.commit,
    provenance,
  });

  if (options.assert && report.fail > 0) process.exitCode = 1;
  if (report.fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
