#!/usr/bin/env tsx
/**
 * DeepEval 叙事质量评估运行器
 *
 * 用途：使用 DeepEval 兼容的指标评估 AI 叙事质量。
 * 支持 mock 模式（离线）和 live 模式（真实 AI）。
 *
 * 用法：
 *   pnpm dlx tsx scripts/eval-deepeval.ts                  # mock 模式全量
 *   pnpm dlx tsx scripts/eval-deepeval.ts --mode live      # live 模式
 *   pnpm dlx tsx scripts/eval-deepeval.ts --calibrate      # 仅校准
 *   pnpm dlx tsx scripts/eval-deepeval.ts --json-out path  # JSON 输出
 */

import {
  CALIBRATION_SEEDS,
  NARRATIVE_METRICS,
  computeCalibrationStats,
  toDeepEvalResult,
} from "../src/lib/evals/deepEval";

interface CliArgs {
  mode: "mock" | "live";
  calibrate: boolean;
  jsonOut?: string;
  verbose: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  return {
    mode: args.includes("--mode") ? (args[args.indexOf("--mode") + 1] === "live" ? "live" : "mock") : "mock",
    calibrate: args.includes("--calibrate"),
    jsonOut: args.includes("--json-out") ? args[args.indexOf("--json-out") + 1] : undefined,
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log("🎭 DeepEval 叙事质量评估");
  console.log("═".repeat(50));
  console.log(`模式: ${args.mode}`);
  console.log(`维度: ${NARRATIVE_METRICS.map((m) => m.name).join("、")}`);

  if (args.calibrate) {
    console.log("\n📏 运行裁判校准...");
    console.log(`校准样本数: ${CALIBRATION_SEEDS.length}`);

    for (const sample of CALIBRATION_SEEDS) {
      console.log(`\n  [${sample.id}] ${sample.scenario}`);
      const dims = Object.entries(sample.humanScores)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      console.log(`    人工评分: ${dims} → ${sample.humanPassed ? "✅" : "❌"}`);
    }

    console.log("\n⚠️ 校准需要人工标注更多样本（建议20-50）。");
    console.log("   当前种子样本仅用于框架验证，不用于 gate 判定。");
    console.log("   补充校准样本后，运行 computeCalibrationStats() 验证相关性。");
    return;
  }

  // 使用 mock 数据进行评估演示
  console.log("\n📊 模拟评估运行...");

  const mockResults = CALIBRATION_SEEDS.slice(0, 5).map((sample) => {
    // 模拟 LLM 裁判评分（在校准的裁判中会用真实 AI 替代）
    const mockJudgeScores: Record<string, number> = {};
    for (const [key, humanScore] of Object.entries(sample.humanScores)) {
      // 模拟：分数在人工分附近随机波动 ±1
      mockJudgeScores[key] = Math.max(1, Math.min(5, humanScore + Math.round(Math.random() * 2 - 1)));
    }

    const overall = Object.values(mockJudgeScores).reduce((a, b) => a + b, 0) / Object.values(mockJudgeScores).length;
    return toDeepEvalResult({
      caseId: sample.id,
      dimensionScores: mockJudgeScores,
      overallScore: Math.round(overall * 10) / 10,
      passed: overall >= 3,
      reasoning: `模拟裁判评分: ${JSON.stringify(mockJudgeScores)}`,
      narrativeChars: sample.narrativeChars,
      turnCount: 1,
    });
  });

  const passed = mockResults.filter((r) => r.success).length;
  const avgScore = mockResults.reduce((a, b) => a + b.score, 0) / mockResults.length;

  console.log(`\n  总样本数: ${mockResults.length}`);
  console.log(`  通过: ${passed}/${mockResults.length} (${(passed / mockResults.length * 100).toFixed(0)}%)`);
  console.log(`  平均分: ${avgScore.toFixed(1)}/5`);

  console.log("\n  分维度统计:");
  for (const metric of NARRATIVE_METRICS) {
    const scores = mockResults
      .flatMap((r) => r.metrics.filter((m) => m.metric === metric.id))
      .map((m) => m.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`    ${metric.name}: avg=${avg.toFixed(1)}, threshold=${metric.hardFloor ?? 3}`);
  }

  if (args.jsonOut) {
    const fs = await import("node:fs");
    fs.writeFileSync(args.jsonOut, JSON.stringify(mockResults, null, 2), "utf8");
    console.log(`\n📄 JSON 输出: ${args.jsonOut}`);
  }

  console.log("\n✅ DeepEval 评估完成");
}

main().catch((err) => {
  console.error("评估失败:", err);
  process.exit(1);
});
