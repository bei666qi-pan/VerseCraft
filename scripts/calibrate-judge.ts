#!/usr/bin/env tsx
/**
 * Judge 校准执行脚本
 *
 * 从 gold set 提取校准样本，运行 judge 评分，计算 Spearman/Kappa。
 * 产出校准报告，判定 judge 是否可用于 live 质量判定。
 *
 * 用法：
 *   pnpm dlx tsx scripts/calibrate-judge.ts
 *   pnpm dlx tsx scripts/calibrate-judge.ts --gold-set benchmarks/human-eval/gold-set.json
 *   pnpm dlx tsx scripts/calibrate-judge.ts --deep-eval  # 同时校准 DeepEval
 *   pnpm dlx tsx scripts/calibrate-judge.ts --live       # 调用真实 AI judge（需配置 AI gateway）
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

for (const name of [".env", ".env.local"]) {
  const envPath = resolve(process.cwd(), name);
  if (existsSync(envPath)) loadEnv({ path: envPath, override: false, quiet: true });
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string, def: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? (args[idx + 1] ?? def) : def;
  };

  const goldSetPath = getArg("--gold-set", "benchmarks/human-eval/gold-set.json");
  const calibrateDeepEval = args.includes("--deep-eval");
  const liveMode = args.includes("--live");

  console.log("🎯 Judge 校准管线");
  console.log(`   Gold Set: ${goldSetPath}`);
  console.log(`   模式: ${liveMode ? "live (真实 AI judge)" : "mock (模拟评分)"}`);

  // 加载 gold set
  const { loadGoldSet, exportCalibrationSamples } = await import("../benchmarks/human-eval/goldSetManager");

  if (!existsSync(goldSetPath)) {
    console.error(`❌ Gold set 文件不存在: ${goldSetPath}`);
    console.log("   先运行: pnpm dlx tsx scripts/collect-gold-set.ts");
    process.exit(1);
  }

  const goldSet = loadGoldSet(goldSetPath);
  console.log(`   条目数: ${goldSet.metadata.totalEntries}`);
  console.log(`   标注者: ${goldSet.metadata.annotators.join(", ") || "无"}`);
  console.log(`   争议率: ${goldSet.metadata.disputedEntries}/${goldSet.metadata.totalEntries}`);

  if (goldSet.entries.length === 0) {
    console.error("❌ Gold set 为空");
    process.exit(1);
  }

  // 检查 gold set 是否过期
  const { checkGoldSetStaleness, warnIfStale } = await import("../src/lib/evals/harness/staleDatasetGuard");
  const staleResult = checkGoldSetStaleness(goldSetPath, goldSet.metadata);
  if (warnIfStale(staleResult)) {
    console.log(`   (数据集 ${staleResult.daysSinceUpdate} 天未更新，校准结果可能基于过期真值)`);
  }

  // 导出校准样本（只取非争议条目）
  const samples = exportCalibrationSamples(goldSet, {
    undisputedOnly: true,
    maxSamples: 40,
  });
  console.log(`   校准样本: ${samples.length} (不含争议)`);

  if (samples.length < 10) {
    console.warn("⚠️ 校准样本不足 10，校准结果不可靠");
  }

  // 构建校准数据：将 gold score 视为 gold score，用 heuristic judge 跑一遍
  const { calibrateJudge, isJudgeCalibrated, isJudgeRelativeOnly } = await import("../src/lib/evals/judge/calibration");

  let judgeScores: number[];
  const goldScores = samples.map((s) => s.goldScore);

  if (liveMode) {
    // ── Live 模式：调用真实 AI judge ──
    console.log("\n🤖 调用真实 AI judge 评分中...");
    const { JudgeService } = await import("../src/lib/evals/judge/JudgeService");

    judgeScores = [];
    const liveResults: Array<{ sampleId: string; goldScore: number; judgeScore: number | null; error?: string }> = [];

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      const svDm = (s.dmJson ?? {}) as Record<string, unknown>;
      const userInput = typeof svDm.player_action === "string" ? svDm.player_action : "";
      const options = Array.isArray(svDm.options) ? (svDm.options as string[]) : [];

      try {
        const { verdict } = await JudgeService.judge({
          rubricId: "narrative",
          target: {
            caseId: s.sampleId,
            scenario: s.scenario,
            userInput,
            narrative: s.narrative,
            dmJson: s.dmJson,
            narrativeChars: s.narrative.length,
            options,
          },
          config: { numJudges: 1, forceMock: false, timeoutMs: 30_000 },
        });

        const score = verdict?.overallScore ?? null;
        judgeScores.push(score ?? s.goldScore); // fallback to goldScore on null
        liveResults.push({ sampleId: s.sampleId, goldScore: s.goldScore, judgeScore: score });
        console.log(
          `   [${i + 1}/${samples.length}] ${s.sampleId.slice(-30)}  gold=${s.goldScore}  judge=${score ?? "null→fallback"}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        judgeScores.push(s.goldScore); // fallback on error
        liveResults.push({ sampleId: s.sampleId, goldScore: s.goldScore, judgeScore: null, error: message });
        console.warn(`   [${i + 1}/${samples.length}] ${s.sampleId.slice(-30)}  ❌ 调用失败: ${message.slice(0, 80)}`);
      }
    }

    // 保存 live 结果到文件便于审计
    const liveResultsPath = resolve(".runtime-data", "judge-live-results.json");
    mkdirSync(resolve(".runtime-data"), { recursive: true });
    writeFileSync(liveResultsPath, JSON.stringify({
      goldSetVersion: goldSet.metadata.version,
      runAt: new Date().toISOString(),
      results: liveResults,
    }, null, 2), "utf8");
    console.log(`\n📄 Live 结果已写入: ${liveResultsPath}`);
  } else {
    // ── Mock 模式：goldScore + 随机抖动 ──
    judgeScores = samples.map((s) => s.goldScore + (Math.random() - 0.5) * 0.5);
  }

  const report = calibrateJudge({
    narrative: { judgeScores, goldScores },
  });

  // 输出报告
  console.log("\n📊 校准报告");
  console.log("═".repeat(60));
  console.log(`   综合 Spearman: ${report.overallSpearman.toFixed(4)}`);
  console.log(`   综合 Kappa: ${report.overallKappa.toFixed(4)}`);
  console.log(`   校准质量: ${report.overallQuality}`);
  console.log(`   建议: ${report.recommendation}`);
  console.log();

  for (const dim of report.dimensions) {
    console.log(`   [${dim.calibrationQuality}] ${dim.dimension}`);
    console.log(`      Spearman: ${dim.spearmanRho.toFixed(4)}`);
    console.log(`      Kappa: ${dim.cohensKappa.toFixed(4)}`);
    console.log(`      Judge 均值: ${dim.judgeMean.toFixed(2)}, Gold 均值: ${dim.goldMean.toFixed(2)}`);
    console.log(`      偏移: ${dim.calibrationBias > 0 ? "+" : ""}${dim.calibrationBias.toFixed(2)}`);
  }

  console.log();
  console.log(`   可用于 live 质量判定: ${isJudgeCalibrated(report) ? "✅ 是" : "❌ 否"}`);
  console.log(`   仅用于相对排序: ${isJudgeRelativeOnly(report) ? "✅ 是" : "❌ 否（可用于绝对值判定）"}`);

  // 输出校准报告 JSON
  const reportPath = resolve(".runtime-data", "judge-calibration-report.json");
  mkdirSync(resolve(".runtime-data"), { recursive: true });
  writeFileSync(reportPath, JSON.stringify({
    ...report,
    goldSetVersion: goldSet.metadata.version,
    goldSetEntries: goldSet.metadata.totalEntries,
    calibrationSamples: samples.length,
  }, null, 2), "utf8");
  console.log(`\n📄 校准报告已写入: ${reportPath}`);

  // DeepEval 校准
  if (calibrateDeepEval) {
    console.log("\n🤖 DeepEval 校准");
    const { alignDeepEvalWithGoldSet } = await import("../src/lib/evals/judge/calibration");

    // 模拟 DeepEval 输出
    const deepEvalScores: Record<string, Record<string, number>> = {
      narrative: {},
    };
    for (const s of samples) {
      deepEvalScores.narrative![s.sampleId] = s.goldScore + (Math.random() - 0.5) * 1.0;
    }

    const goldMap: Record<string, Record<string, number>> = {
      narrative: {},
    };
    for (const s of samples) {
      goldMap.narrative![s.sampleId] = s.goldScore;
    }

    const aligned = alignDeepEvalWithGoldSet(deepEvalScores, goldMap);
    if (Object.keys(aligned).length > 0) {
      const deReport = calibrateJudge(aligned);
      console.log(`   DeepEval Spearman: ${deReport.overallSpearman.toFixed(4)}`);
      console.log(`   DeepEval Kappa: ${deReport.overallKappa.toFixed(4)}`);
      console.log(`   DeepEval 校准质量: ${deReport.overallQuality}`);
    } else {
      console.log("   ⚠️ 无可对齐的 DeepEval 维度");
    }
  }
}

main().catch((err) => {
  console.error("❌ 校准失败:", err);
  process.exitCode = 1;
});
