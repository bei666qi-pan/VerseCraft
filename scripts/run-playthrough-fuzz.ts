#!/usr/bin/env tsx
/**
 * Nightly Playthrough Fuzz Runner
 *
 * 把 playthrough harness 作为「有状态系统的模糊测试器」使用。
 * 跑全部 scenarios × 各自 personas × N 局，聚合失败，生成报告。
 *
 * 用法：
 *   pnpm dlx tsx scripts/run-playthrough-fuzz.ts                              # 默认：全量 20 场景 × 多 persona × 1 局
 *   pnpm dlx tsx scripts/run-playthrough-fuzz.ts --runs 3                     # 每对 scenario-persona 跑 3 局
 *   pnpm dlx tsx scripts/run-playthrough-fuzz.ts --categories happy,recovery  # 仅跑指定路径
 *   pnpm dlx tsx scripts/run-playthrough-fuzz.ts --max-steps 15              # 每局最多 15 步
 *   pnpm dlx tsx scripts/run-playthrough-fuzz.ts --live                       # Live 模式（需 AI gateway）
 *   pnpm dlx tsx scripts/run-playthrough-fuzz.ts --live --base-url http://localhost:667  # 自定义 API 地址
 *   pnpm dlx tsx scripts/run-playthrough-fuzz.ts --json-out path              # JSON 输出
 *   pnpm dlx tsx scripts/run-playthrough-fuzz.ts --fail-on-regression        # 失败率超阈值时非零退出
 *   pnpm dlx tsx scripts/run-playthrough-fuzz.ts --threshold 0.15             # 自定义失败率阈值（默认 0.10）
 *
 * 设计目标（每晚定时）：
 * - 默认 mock 模式：不调外部 API，CI / 本地都能跑
 * - 可选 live 模式：调真实 /api/chat，需要 AI gateway 凭据
 * - 输出 trace artifact 到 .runtime-data/fuzz-traces/ 便于回放
 * - 失败聚类输出到 stdout + JSON report，便于追踪反复出现的失败模式
 */

import {
  runPlaythroughBatchV3,
  getScenarioLibraryCounts,
} from "../src/lib/evals/playthrough";
import type { PlaythroughV3Config } from "../src/lib/evals/playthrough";
import type { ScenarioCategory } from "../src/lib/evals/playthrough";
import { resolve } from "node:path";

interface CliArgs {
  runs: number;
  maxSteps: number;
  live: boolean;
  baseUrl?: string;
  jsonOut?: string;
  failOnRegression: boolean;
  threshold: number;
  categories?: ScenarioCategory[];
  traceOutputDir: string;
  verbose: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const getInt = (name: string, def: number) => {
    const i = args.indexOf(name);
    return i >= 0 ? parseInt(args[i + 1] ?? `${def}`, 10) : def;
  };
  const getFloat = (name: string, def: number) => {
    const i = args.indexOf(name);
    return i >= 0 ? parseFloat(args[i + 1] ?? `${def}`) : def;
  };
  const getStr = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const cats = getStr("--categories");
  return {
    runs: getInt("--runs", 1),
    maxSteps: getInt("--max-steps", 20),
    live: args.includes("--live"),
    baseUrl: getStr("--base-url") ?? process.env.PLAYTHROUGH_BASE_URL,
    jsonOut: getStr("--json-out"),
    failOnRegression: args.includes("--fail-on-regression"),
    threshold: getFloat("--threshold", 0.10),
    categories: cats ? (cats.split(",").map((s) => s.trim()) as ScenarioCategory[]) : undefined,
    traceOutputDir: getStr("--trace-dir") ?? ".runtime-data/fuzz-traces",
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log("🌙 VerseCraft Nightly Playthrough Fuzz");
  console.log("═".repeat(60));

  const counts = getScenarioLibraryCounts();
  console.log(`场景库: total=${counts.total}, byCategory=${JSON.stringify(counts.byCategory)}`);
  console.log(`模式: ${args.live ? "live（真实 API）" : "mock（离线规则）"}`);
  if (args.baseUrl) console.log(`API 地址: ${args.baseUrl}`);
  console.log(`每对 (scenario, persona) 跑 ${args.runs} 局`);
  console.log(`每局最大步数: ${args.maxSteps}`);
  console.log(`失败率阈值: ${(args.threshold * 100).toFixed(0)}%${args.failOnRegression ? "（fail-on-regression 开启）" : ""}`);
  console.log(`Trace artifact 输出: ${args.traceOutputDir}`);
  console.log("");

  const config: PlaythroughV3Config = {
    // v1 字段
    personas: ["speedrunner", "explorer", "rulebreaker", "confused", "collector"],
    runsPerPersona: args.runs,
    maxStepsPerRun: args.maxSteps,
    baseSeed: 42,
    mockMode: !args.live,
    baseUrl: args.baseUrl,
    runNarrativeJudge: true,
    softlockThreshold: 8,
    stepTimeoutMs: 30000,
    // v3 字段
    scenarioCategories: args.categories,
    traceOutputDir: args.traceOutputDir,
    enableFailureClustering: true,
  };

  const startTime = Date.now();
  const summary = await runPlaythroughBatchV3(config);
  const elapsed = (Date.now() - startTime) / 1000;

  // === 报告输出 ===

  console.log("\n📊 Fuzz 报告");
  console.log("═".repeat(60));
  console.log(`总运行数: ${summary.totalRuns}`);
  console.log(`通过: ${summary.passedRuns} (${(summary.passRate * 100).toFixed(1)}%)`);
  console.log(`失败: ${summary.failedRuns}`);
  console.log(`耗时: ${elapsed.toFixed(1)}s`);

  console.log("\n--- 按 Persona ---");
  for (const [name, stats] of Object.entries(summary.byPersona)) {
    const icon = stats.rate >= 0.8 ? "✅" : stats.rate >= 0.5 ? "⚠️" : "❌";
    console.log(`  ${icon} ${name}: ${stats.passed}/${stats.total} (${(stats.rate * 100).toFixed(0)}%)`);
  }

  console.log("\n--- 按 Scenario ---");
  for (const [sid, s] of Object.entries(summary.scenarioMap)) {
    const rate = s.total > 0 ? s.passed / s.total : 0;
    const icon = rate >= 0.8 ? "✅" : rate >= 0.5 ? "⚠️" : "❌";
    console.log(`  ${icon} ${sid} (${s.category}): ${s.passed}/${s.total}`);
  }

  console.log("\n--- 失败聚类（top 10） ---");
  if (summary.failureClusters.length === 0) {
    console.log("  ✅ 无失败聚类");
  } else {
    for (const cluster of summary.failureClusters.slice(0, 10)) {
      console.log(`  🔴 ${cluster.label} × ${cluster.count} 次`);
      console.log(`     首次: ${cluster.firstSeen} | 最近: ${cluster.lastSeen}`);
      if (cluster.runIds.length > 0) {
        console.log(`     示例: ${cluster.runIds.slice(0, 3).join(", ")}`);
      }
    }
  }

  console.log("\n--- 终止原因 ---");
  for (const [reason, count] of Object.entries(summary.byTermination)) {
    const labels: Record<string, string> = {
      reached_ending: "🏁 正常结局",
      death: "💀 死亡",
      max_steps: "⏱️ 达到上限",
      softlock: "🔒 卡死",
    };
    console.log(`  ${labels[reason] ?? reason}: ${count}`);
  }

  // === JSON 输出 ===

  if (args.jsonOut) {
    const fs = await import("node:fs/promises");
    await fs.mkdir(resolve(args.jsonOut, ".."), { recursive: true }).catch(() => {});
    const report = {
      version: "v3",
      mode: args.live ? "live" : "mock",
      timestamp: new Date().toISOString(),
      durationSeconds: elapsed,
      config: {
        runsPerPersona: args.runs,
        maxStepsPerRun: args.maxSteps,
        categories: args.categories,
      },
      summary: {
        totalRuns: summary.totalRuns,
        passedRuns: summary.passedRuns,
        failedRuns: summary.failedRuns,
        passRate: summary.passRate,
        byPersona: summary.byPersona,
        byTermination: summary.byTermination,
      },
      scenarioMap: summary.scenarioMap,
      failureClusters: summary.failureClusters,
      traceArtifacts: summary.traceArtifacts,
    };
    await fs.writeFile(args.jsonOut, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n📄 JSON 报告: ${args.jsonOut}`);
  }

  // === 退出码 ===

  const failureRate = 1 - summary.passRate;
  if (args.failOnRegression && failureRate > args.threshold) {
    console.log(`\n❌ 失败率 ${(failureRate * 100).toFixed(1)}% 超过阈值 ${(args.threshold * 100).toFixed(0)}%`);
    process.exit(1);
  }

  if (summary.failedRuns > 0 && !args.failOnRegression) {
    console.log(`\n⚠️ 存在 ${summary.failedRuns} 个失败 run，但 fail-on-regression 未启用`);
  }

  console.log("\n✅ Nightly Fuzz 完成");
}

main().catch((err) => {
  console.error("❌ Fuzz runner 失败:", err);
  process.exit(2);
});