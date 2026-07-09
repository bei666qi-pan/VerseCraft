#!/usr/bin/env tsx
/**
 * 长程 Playthrough 模拟器运行器
 *
 * 跑 N 局 × M 个 persona，收集 transcript，聚合失败，生成报告。
 *
 * 用法：
 *   pnpm dlx tsx scripts/run-playthrough.ts                        # mock 模式，所有 persona
 *   pnpm dlx tsx scripts/run-playthrough.ts --persona speedrunner  # 仅速通型
 *   pnpm dlx tsx scripts/run-playthrough.ts --runs 5               # 每个 persona 跑 5 局
 *   pnpm dlx tsx scripts/run-playthrough.ts --live                 # Live 模式（需 DEEPSEEK_API_KEY）
 *   pnpm dlx tsx scripts/run-playthrough.ts --json-out path        # JSON 输出
 *   pnpm dlx tsx scripts/run-playthrough.ts --no-narrative-judge   # 跳过叙事裁判
 */

import {
  PERSONAS,
  runPlaythroughBatch,
} from "../src/lib/evals/playthrough";
import type {
  PersonaType,
  PlaythroughRunConfig,
} from "../src/lib/evals/playthrough";

interface CliArgs {
  persona?: PersonaType;
  runs: number;
  mockMode: boolean;
  narrativeJudge: boolean;
  jsonOut?: string;
  verbose: boolean;
  maxSteps: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const personaArg = args.includes("--persona")
    ? (args[args.indexOf("--persona") + 1] as PersonaType | undefined)
    : undefined;
  return {
    persona: personaArg,
    runs: args.includes("--runs") ? parseInt(args[args.indexOf("--runs") + 1] ?? "3", 10) : 3,
    mockMode: !args.includes("--live"),
    narrativeJudge: !args.includes("--no-narrative-judge"),
    jsonOut: args.includes("--json-out") ? args[args.indexOf("--json-out") + 1] : undefined,
    verbose: args.includes("--verbose") || args.includes("-v"),
    maxSteps: args.includes("--max-steps") ? parseInt(args[args.indexOf("--max-steps") + 1] ?? "20", 10) : 20,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const personas = args.persona ? [args.persona] : ["speedrunner", "explorer", "rulebreaker", "confused", "collector"] as PersonaType[];

  console.log("🎮 VerseCraft 长程 Playthrough 模拟器");
  console.log("═".repeat(60));
  console.log(`模式: ${args.mockMode ? "mock（离线模拟）" : "live（真实API）"}`);
  console.log(`Persona: ${personas.map((p) => PERSONAS[p]?.name ?? p).join(", ")}`);
  console.log(`每 persona 运行: ${args.runs} 局`);
  console.log(`总预计: ${personas.length * args.runs} 局`);
  console.log(`每局最大步数: ${args.maxSteps}`);
  console.log(`叙事裁判: ${args.narrativeJudge ? "开启" : "跳过"}`);
  console.log("");

  const config: PlaythroughRunConfig = {
    personas,
    runsPerPersona: args.runs,
    maxStepsPerRun: args.maxSteps,
    baseSeed: 42,
    mockMode: args.mockMode,
    runNarrativeJudge: args.narrativeJudge,
    softlockThreshold: 8,
    stepTimeoutMs: 30000,
  };

  const startTime = Date.now();
  const summary = await runPlaythroughBatch(config);

  // 打印报告
  console.log("\n📊 批次运行报告");
  console.log("═".repeat(60));
  console.log(`总局数: ${summary.totalRuns}`);
  console.log(`通过: ${summary.passedRuns}/${summary.totalRuns} (${(summary.passRate * 100).toFixed(0)}%)`);
  console.log(`失败: ${summary.failedRuns}`);
  console.log(`总耗时: ${(summary.durationMs / 1000).toFixed(1)}s`);

  console.log("\n--- 按 Persona ---");
  for (const [name, stats] of Object.entries(summary.byPersona)) {
    const icon = stats.rate >= 0.8 ? "✅" : stats.rate >= 0.5 ? "⚠️" : "❌";
    console.log(`  ${icon} ${name}: ${stats.passed}/${stats.total} (${(stats.rate * 100).toFixed(0)}%)`);
    console.log(`     平均步数: ${stats.avgSteps} | softlock: ${stats.softlockCount} | 不变量失败: ${stats.invariantFailures} | 叙事失败: ${stats.narrativeFailures}`);
  }

  console.log("\n--- 按终止原因 ---");
  for (const [reason, count] of Object.entries(summary.byTermination)) {
    const labels: Record<string, string> = {
      reached_ending: "🏁 正常结局",
      death: "💀 死亡",
      max_steps: "⏱️ 达到上限",
      softlock: "🔒 卡死",
      invariant_failed: "❌ 不变量失败",
      error: "🔥 错误",
    };
    console.log(`  ${labels[reason] ?? reason}: ${count}`);
  }

  if (summary.topViolations.length > 0) {
    console.log("\n--- Top 不变量违规 ---");
    for (const v of summary.topViolations) {
      console.log(`  • ${v.rule}: ${v.count} 次`);
    }
  }

  if (summary.topConsistencyIssues.length > 0) {
    console.log("\n--- Top 叙事一致性问题 ---");
    for (const issue of summary.topConsistencyIssues) {
      console.log(`  • ${issue.type}: ${issue.count} 次`);
    }
  }

  console.log(`\n🏁 Gate: ${summary.gatePass ? "✅ 通过" : "❌ 未通过"} (阈值 80%)`);

  // JSON 输出
  if (args.jsonOut) {
    const fs = await import("node:fs");
    const jsonOutput = {
      summary: {
        ...summary,
        results: summary.results.map((r) => ({
          runId: r.transcript.runId,
          persona: r.transcript.persona,
          passed: r.passed,
          terminatedReason: r.transcript.terminatedReason,
          totalSteps: r.transcript.totalSteps,
          durationMs: r.transcript.durationMs,
          failures: r.failureSummary,
        })),
      },
    };
    fs.writeFileSync(args.jsonOut, JSON.stringify(jsonOutput, null, 2), "utf8");
    console.log(`\n📄 JSON 输出: ${args.jsonOut}`);
  }

  // 速查快速成功/失败
  const failedResults = summary.results.filter((r) => !r.passed);
  if (failedResults.length > 0) {
    console.log("\n--- 失败详情 ---");
    for (const fr of failedResults) {
      console.log(`  [${fr.transcript.runId}] 终止原因=${fr.transcript.terminatedReason}`);
      for (const f of fr.failureSummary.slice(0, 3)) {
        console.log(`    - ${f}`);
      }
    }
  }

  console.log("\n⏱️ 提示：mock 模式不调真实 LLM，行为分布与真人玩家有系统性偏差。");
  console.log("   它擅长：大规模覆盖、回归测试、逮机械 bug 和一致性崩坏。");
  console.log("   它不擅长：替代人工 UAT、预测真实用户行为分布。");
}

main().catch((err) => {
  console.error("Playthrough 运行失败:", err);
  process.exit(1);
});
