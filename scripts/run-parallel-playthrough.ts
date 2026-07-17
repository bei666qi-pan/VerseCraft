#!/usr/bin/env tsx
/**
 * 多 Agent 并行游玩测试运行器
 *
 * 目标：针对 5 个游戏系统（武器、职业/转职、任务、战斗、收集+经济）
 * 并行运行所有场景，每个场景覆盖其 persona，100 步长程。
 *
 * 使用 v3 batch 编排，trace artifact 落盘，汇总比较结果。
 *
 * 用法：
 *   pnpm dlx tsx scripts/run-parallel-playthrough.ts
 *   pnpm dlx tsx scripts/run-parallel-playthrough.ts --runs 5      # 每个 persona 跑 5 局
 *   pnpm dlx tsx scripts/run-parallel-playthrough.ts --steps 200    # 每局 200 步
 *   pnpm dlx tsx scripts/run-parallel-playthrough.ts --no-judge     # 跳过叙事裁判
 *   pnpm dlx tsx scripts/run-parallel-playthrough.ts --verbose      # 详细日志
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "node:fs";
import * as path from "node:path";
import {
  runPlaythroughBatchV3,
  SCENARIOS,
  findScenario,
  getScenarioLibraryStats,
} from "../src/lib/evals/playthrough";
import type { PlaythroughV3Config, PersonaType, ScenarioCategory } from "../src/lib/evals/playthrough";

// ─── CLI ───

interface CliArgs {
  runsPerPersona: number;
  maxStepsPerRun: number;
  runNarrativeJudge: boolean;
  verbose: boolean;
  traceDir: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  return {
    runsPerPersona: args.includes("--runs") ? parseInt(args[args.indexOf("--runs") + 1] ?? "3", 10) : 3,
    maxStepsPerRun: args.includes("--steps") ? parseInt(args[args.indexOf("--steps") + 1] ?? "100", 10) : 100,
    runNarrativeJudge: !args.includes("--no-judge"),
    verbose: args.includes("--verbose") || args.includes("-v"),
    traceDir: args.includes("--trace-dir")
      ? (args[args.indexOf("--trace-dir") + 1] ?? ".runtime-data/playthrough/parallel-traces")
      : ".runtime-data/playthrough/parallel-traces",
  };
}

// ─── 5 个游戏系统的场景分组 ───

interface SystemGroup {
  name: string;
  emoji: string;
  description: string;
  scenarioIds: string[];
}

const SYSTEM_GROUPS: SystemGroup[] = [
  {
    name: "武器系统",
    emoji: "🗡️",
    description: "武器获取→使用→损耗→实战战斗循环",
    scenarioIds: ["weapon-lifecycle", "weapon-combat"],
  },
  {
    name: "职业/转职",
    emoji: "⚔️",
    description: "职业进阶路线、职业与战斗联动",
    scenarioIds: ["profession-progression", "profession-combat-synergy"],
  },
  {
    name: "任务系统",
    emoji: "📋",
    description: "任务领取→推进→完成、多任务并行",
    scenarioIds: ["quest-lifecycle", "quest-multiple-active"],
  },
  {
    name: "战斗系统",
    emoji: "💥",
    description: "战斗生存链、武器随战斗降级",
    scenarioIds: ["combat-survival", "combat-weapon-degradation"],
  },
  {
    name: "收集+经济",
    emoji: "💰",
    description: "已注册锻造消费闭环、行囊收集边界",
    scenarioIds: ["forge-service-flow", "inventory-hoarding"],
  },
];

// 也包含老的原有场景作对比基准（可选）
const ORIGINAL_HAPPY_IDS = ["happy-speedrun", "happy-explore", "happy-trade", "happy-npc-interaction", "happy-combat-loop"];

// ─── 主流程 ───

async function main(): Promise<void> {
  const args = parseArgs();
  const traceDir = path.resolve(args.traceDir);
  fs.mkdirSync(traceDir, { recursive: true });

  console.log("🧪 VerseCraft 多 Agent 并行游玩测试");
  console.log("═".repeat(70));
  console.log(`每 persona 运行: ${args.runsPerPersona} 局`);
  console.log(`每局最大步数: ${args.maxStepsPerRun}`);
  console.log(`叙事裁判: ${args.runNarrativeJudge ? "开启" : "跳过"}`);
  console.log(`Trace 输出: ${traceDir}`);
  console.log("");

  // 收集所有待跑场景
  const systemScenarioIds = SYSTEM_GROUPS.flatMap((g) => g.scenarioIds);
  const allScenarioIds = [...systemScenarioIds];

  // 验证所有场景 ID 存在
  const missingIds = allScenarioIds.filter((id) => !findScenario(id));
  if (missingIds.length > 0) {
    console.error(`❌ 未找到场景: ${missingIds.join(", ")}`);
    process.exit(1);
  }

  // 内置场景数量统计
  const stats = getScenarioLibraryStats();
  console.log(`📚 场景库: ${stats.total} 总场景`);
  console.log(`   本次运行: ${allScenarioIds.length} 个新场景 + ${ORIGINAL_HAPPY_IDS.length} 个原有场景`);
  console.log("");

  // ─── 打印各系统覆盖 plan ───

  console.log("📋 系统覆盖计划:");
  console.log("");
  for (const group of SYSTEM_GROUPS) {
    const scenarios = group.scenarioIds.map((id) => findScenario(id)!);
    const personaList = [...new Set(scenarios.flatMap((s) => s.personas))];
    const totalRuns = scenarios.reduce((sum, s) => sum + s.personas.length * args.runsPerPersona, 0);
    console.log(`  ${group.emoji} ${group.name}: ${group.description}`);
    console.log(`     场景: ${group.scenarioIds.map((id) => `"${id}"`).join(", ")}`);
    console.log(`     Persona: ${personaList.join(", ")}`);
    console.log(`     预计局数: ${totalRuns}`);
    console.log("");
  }

  // ─── 并行运行所有系统 ───

  const startTime = Date.now();
  const systemResults: Array<{
    group: SystemGroup;
    result: Awaited<ReturnType<typeof runPlaythroughBatchV3>>;
  }> = [];

  // 逐个运行（每个系统独立 batch，可在后续版本改为真正并行）
  for (const group of SYSTEM_GROUPS) {
    const scenarios = group.scenarioIds.map((id) => findScenario(id)!);

    console.log(`\n${"─".repeat(60)}`);
    console.log(`${group.emoji} 运行 ${group.name}...`);
    console.log(`${"─".repeat(60)}`);

    // 收集所有关联 persona（用于 byPersona 统计）
    const groupPersonas = [...new Set(scenarios.flatMap((s) => s.personas))] as PersonaType[];

    const config: PlaythroughV3Config = {
      // 按场景 ID 过滤
      scenarioIds: group.scenarioIds,
      personas: groupPersonas,
      runsPerPersona: args.runsPerPersona,
      maxStepsPerRun: args.maxStepsPerRun,
      baseSeed: 42,
      mockMode: true,
      runNarrativeJudge: args.runNarrativeJudge,
      softlockThreshold: 8,
      stepTimeoutMs: 30000,
      traceOutputDir: path.join(traceDir, group.name),
      enableFailureClustering: true,
    };

    try {
      const result = await runPlaythroughBatchV3(config);

      systemResults.push({ group, result });

      // 打印该系统的快速摘要
      const passRate = (result.passedRuns / result.totalRuns * 100).toFixed(0);
      console.log(`  ✅ 完成: ${result.passedRuns}/${result.totalRuns} 通过 (${passRate}%)`);
      console.log(`     耗时: ${(result.durationMs / 1000).toFixed(1)}s`);

      // 按场景统计
      for (const [sid, sc] of Object.entries(result.scenarioMap)) {
        const scPassRate = (sc.passed / sc.total * 100).toFixed(0);
        console.log(`     📊 ${sid}: ${sc.passed}/${sc.total} (${scPassRate}%)`);
      }

      if (result.topViolations.length > 0) {
        console.log(`     违规: ${result.topViolations.map((v) => `${v.rule}(${v.count})`).join(", ")}`);
      }
      if (result.topConsistencyIssues.length > 0) {
        console.log(`     叙事问题: ${result.topConsistencyIssues.map((i) => `${i.type}(${i.count})`).join(", ")}`);
      }
      if (result.failureClusters.length > 0) {
        console.log(`     失败聚类: ${result.failureClusters.slice(0, 3).map((c) => `${c.label}(${c.count})`).join(", ")}`);
      }
    } catch (err) {
      console.error(`  ❌ ${group.name} 运行失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    console.log("");
  }

  // ─── 也跑原有 happy 场景作为对比基准 ───

  console.log(`\n${"─".repeat(60)}`);
  console.log("📊 运行原有 happy 场景（对比基准）...");
  console.log(`${"─".repeat(60)}`);

  try {
    const baselineConfig: PlaythroughV3Config = {
      scenarioIds: ORIGINAL_HAPPY_IDS,
      personas: ["speedrunner", "explorer", "rulebreaker", "confused", "collector"] as PersonaType[],
      runsPerPersona: 2,
      maxStepsPerRun: Math.min(args.maxStepsPerRun, 50),
      baseSeed: 42,
      mockMode: true,
      runNarrativeJudge: args.runNarrativeJudge,
      softlockThreshold: 8,
      stepTimeoutMs: 30000,
      traceOutputDir: path.join(traceDir, "baseline"),
      enableFailureClustering: false,
    };
    const baselineResult = await runPlaythroughBatchV3(baselineConfig);
    const baselineRate = (baselineResult.passedRuns / baselineResult.totalRuns * 100).toFixed(0);
    console.log(`  ✅ 完成: ${baselineResult.passedRuns}/${baselineResult.totalRuns} 通过 (${baselineRate}%)`);
    console.log(`     耗时: ${(baselineResult.durationMs / 1000).toFixed(1)}s`);

    // 存基准结果用于比较
    (systemResults as any).push({
      group: { name: "原有基准", emoji: "📊", description: "原有 17 场景（v1 基线）", scenarioIds: [] },
      result: baselineResult,
    });
  } catch (err) {
    console.error(`  ❌ 基线运行失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  const totalDuration = Date.now() - startTime;

  // ─── 生成比较报告 ───

  console.log(`\n${"═".repeat(70)}`);
  console.log("📊 跨系统比较报告");
  console.log(`${"═".repeat(70)}`);
  console.log(`总耗时: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log("");

  // 表格头
  const headerRow = "系统             | 总局数 | 通过率  | 平均步数 | Softlock | 违规   | 叙事问题";
  console.log(headerRow);
  console.log("-".repeat(headerRow.length));

  let totalPass = 0;
  let totalRuns = 0;

  for (const { group, result } of systemResults) {
    const passRate = (result.passedRuns / result.totalRuns * 100).toFixed(0);
    const avgSteps = Object.values(result.byPersona).length > 0
      ? (Object.values(result.byPersona).reduce((s, p) => s + p.avgSteps, 0) / Object.values(result.byPersona).length).toFixed(1)
      : "0";
    const softlocks = Object.values(result.byTermination).reduce((s, c) => s + c, 0) -
      (result.byTermination["reached_ending"] ?? 0) -
      (result.byTermination["max_steps"] ?? 0) -
      (result.byTermination["death"] ?? 0);
    const violationCount = result.topViolations.reduce((s, v) => s + v.count, 0);
    const narrativeCount = result.topConsistencyIssues.reduce((s, i) => s + i.count, 0);

    const name = `${group.emoji} ${group.name}`;
    console.log(
      `${name.padEnd(16)}| ${String(result.totalRuns).padStart(5)}局 | ${passRate.padStart(4)}%  | ${avgSteps.padStart(7)}步 | ${String(softlocks).padStart(4)}次  | ${String(violationCount).padStart(4)}  | ${String(narrativeCount).padStart(4)}`
    );

    totalPass += result.passedRuns;
    totalRuns += result.totalRuns;
  }

  console.log("-".repeat(headerRow.length));
  const overallRate = totalRuns > 0 ? (totalPass / totalRuns * 100).toFixed(0) : "0";
  console.log(
    `${"📊 汇总".padEnd(16)}| ${String(totalRuns).padStart(5)}局 | ${overallRate.padStart(4)}%  | ${"—".padStart(7)} | ${"—".padStart(4)}  | ${"—".padStart(4)}  | ${"—".padStart(4)}`
  );
  console.log("");

  // ─── 各系统详细报告 ───

  for (const { group, result } of systemResults) {
    console.log(`${"─".repeat(60)}`);
    console.log(`${group.emoji} ${group.name} 详情`);
    console.log(`${"─".repeat(60)}`);
    console.log(`通过率: ${result.passedRuns}/${result.totalRuns} gate=${result.gatePass ? "✅" : "❌"}`);
    console.log(`耗时: ${(result.durationMs / 1000).toFixed(1)}s`);
    console.log("");

    // 按 Persona
    console.log("  Persona 明细:");
    for (const [name, p] of Object.entries(result.byPersona)) {
      const icon = p.rate >= 0.8 ? "✅" : p.rate >= 0.5 ? "⚠️" : "❌";
      const avgSteps = p.avgSteps.toFixed(1);
      console.log(`    ${icon} ${name}: ${p.passed}/${p.total} (${(p.rate * 100).toFixed(0)}%) | avg ${avgSteps}步 | softlock=${p.softlockCount} | inv=${p.invariantFailures} | narr=${p.narrativeFailures}`);
    }
    console.log("");

    // 终止原因
    console.log("  终止原因:");
    for (const [reason, count] of Object.entries(result.byTermination)) {
      const labels: Record<string, string> = {
        reached_ending: "🏁 正常结局", death: "💀 死亡", max_steps: "⏱️ 达到上限",
        softlock: "🔒 卡死", invariant_failed: "❌ 不变量", error: "🔥 错误",
      };
      console.log(`    ${labels[reason] ?? reason}: ${count}`);
    }

    // 违规和叙事问题
    if (result.topViolations.length > 0) {
      console.log("  Top 违规:", result.topViolations.map((v) => `${v.rule}(${v.count})`).join(", "));
    }
    if (result.topConsistencyIssues.length > 0) {
      console.log("  叙事问题:", result.topConsistencyIssues.map((i) => `${i.type}(${i.count})`).join(", "));
    }
    if (result.failureClusters.length > 0) {
      console.log("  失败聚类:");
      for (const c of result.failureClusters.slice(0, 5)) {
        console.log(`    🔴 ${c.label}: ${c.count} 次 (首次 ${c.firstSeen})`);
      }
    }
    console.log("");
  }

  // ─── 输出写入文件 ───

  const reportPath = path.join(traceDir, "summary-report.md");
  const reportLines: string[] = [
    "# 多 Agent 并行游玩测试报告",
    "",
    `运行时间: ${new Date().toISOString()}`,
    `配置: 每 persona ${args.runsPerPersona} 局 × ${args.maxStepsPerRun} 步`,
    `总运行: ${totalRuns} 局`,
    `总耗时: ${(totalDuration / 1000).toFixed(1)}s`,
    `Gate 状态: ${totalRuns > 0 && totalPass / totalRuns >= 0.8 ? "✅ 通过" : "❌ 未通过"} (≥80%)`,
    "",
    "## 跨系统比较",
    "",
    "| 系统 | 总局数 | 通过率 | 平均步数 | Softlock | 违规 | 叙事问题 |",
    "|------|--------|--------|----------|----------|------|----------|",
  ];

  for (const { group, result } of systemResults) {
    const passRate = (result.passedRuns / result.totalRuns * 100).toFixed(0);
    const avgSteps = Object.values(result.byPersona).length > 0
      ? (Object.values(result.byPersona).reduce((s, p) => s + p.avgSteps, 0) / Object.values(result.byPersona).length).toFixed(1)
      : "N/A";
    const softlocks = Object.values(result.byTermination).reduce((s, c) => s + c, 0) -
      (result.byTermination["reached_ending"] ?? 0) -
      (result.byTermination["max_steps"] ?? 0) -
      (result.byTermination["death"] ?? 0);
    const violationCount = result.topViolations.reduce((s, v) => s + v.count, 0);
    const narrativeCount = result.topConsistencyIssues.reduce((s, i) => s + i.count, 0);
    reportLines.push(`| ${group.emoji} ${group.name} | ${result.totalRuns} | ${passRate}% | ${avgSteps} | ${softlocks} | ${violationCount} | ${narrativeCount} |`);
  }

  reportLines.push(
    "",
    "## 详情",
    "",
  );

  for (const { group, result } of systemResults) {
    reportLines.push(`### ${group.emoji} ${group.name}`);
    reportLines.push(`- 通过率: ${result.passedRuns}/${result.totalRuns} (${(result.passedRuns / result.totalRuns * 100).toFixed(0)}%)`);
    reportLines.push(`- Gate: ${result.gatePass ? "✅ 通过" : "❌ 未通过"}`);
    reportLines.push(`- 总耗时: ${(result.durationMs / 1000).toFixed(1)}s`);
    reportLines.push(`- Trace artifacts: \`${path.join(traceDir, group.name)}\``);
    reportLines.push("");

    // Persona 明细
    reportLines.push("#### Persona 明细");
    reportLines.push("| Persona | 通过/总数 | 通过率 | 平均步数 | Softlock | 违规 | 叙事 |");
    reportLines.push("|---------|-----------|--------|----------|----------|------|------|");
    for (const [name, p] of Object.entries(result.byPersona)) {
      reportLines.push(`| ${name} | ${p.passed}/${p.total} | ${(p.rate * 100).toFixed(0)}% | ${p.avgSteps.toFixed(1)} | ${p.softlockCount} | ${p.invariantFailures} | ${p.narrativeFailures} |`);
    }
    reportLines.push("");

    // 终止原因
    reportLines.push("#### 终止原因");
    for (const [reason, count] of Object.entries(result.byTermination)) {
      reportLines.push(`- ${reason}: ${count}`);
    }
    reportLines.push("");

    // 失败聚类
    if (result.failureClusters.length > 0) {
      reportLines.push("#### 失败聚类");
      for (const c of result.failureClusters.slice(0, 5)) {
        reportLines.push(`- **${c.label}**: ${c.count} 次 (涉及 ${c.runIds.length} 个 run)`);
      }
      reportLines.push("");
    }

    // 违规
    if (result.topViolations.length > 0) {
      reportLines.push("#### 不变量违规 Top");
      for (const v of result.topViolations) {
        reportLines.push(`- ${v.rule}: ${v.count} 次`);
      }
      reportLines.push("");
    }

    // 叙事问题
    if (result.topConsistencyIssues.length > 0) {
      reportLines.push("#### 叙事一致性问题");
      for (const i of result.topConsistencyIssues) {
        reportLines.push(`- ${i.type}: ${i.count} 次`);
      }
      reportLines.push("");
    }

    reportLines.push("---");
    reportLines.push("");
  }

  fs.writeFileSync(reportPath, reportLines.join("\n"), "utf8");
  console.log(`📄 报告已写入: ${reportPath}`);

  // Final gate
  console.log("");
  console.log("═".repeat(70));
  const overallGateRate = totalRuns > 0 ? totalPass / totalRuns : 0;
  const gatePass = overallGateRate >= 0.8;
  console.log(`🏁 总体 Gate: ${gatePass ? "✅ 通过" : "❌ 未通过"} (${(overallGateRate * 100).toFixed(0)}% ≥ 80%)`);
  console.log(`   总 ${totalRuns} 局, 通过 ${totalPass} 局`);
  console.log(`   总耗时: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`   Trace: ${traceDir}`);
  console.log("");
}

main().catch((err) => {
  console.error("运行失败:", err);
  process.exit(1);
});
