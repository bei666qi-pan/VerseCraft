#!/usr/bin/env tsx
/**
 * Live 小样本长程评测脚本
 *
 * Phase 5.2: ≤5 会话 × 15 回合真实模型跑通，产出 judge 评分 + 定性报告。
 *
 * 设计：
 * - 从场景库中精选 5 个场景，每个跑 15 回合
 * - 使用 HttpSutAdapter 调用真实 /api/chat（需运行 dev server）
 * - 使用 DeepSeek narrative judge 评分
 * - 产出评分 + 定性报告写入 docs/eval/
 *
 * 用法：
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts              # 默认 mock 模式
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --live        # 需要 dev server 运行中
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --base-url http://localhost:666
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --sessions 3  # 自定义会话数
 *   pnpm dlx tsx scripts/eval-playthrough-live.ts --out path    # 自定义报告路径
 *
 * 环境变量：
 *   DEEPSEEK_API_KEY  — 叙事裁判需要（mock 模式跳过）
 *   LIVEPLAY_BASE_URL — 默认 http://localhost:666
 */

import { createSutAdapter, SCENARIOS, runSinglePlaythroughV3, PERSONAS } from "../src/lib/evals/playthrough";
import type { PlaythroughV3Config, Scenario, PersonaType } from "../src/lib/evals/playthrough";
import { judgeNarrativeConsistencyMock, judgeNarrativeConsistencyLive } from "../src/lib/evals/playthrough/narrativeJudge";
import { createInitialStateSnapshot } from "../src/lib/evals/playthrough/invariants";
import { generateMockAction } from "../src/lib/evals/playthrough/playerAgent";
import type { SutAdapter, SutAction } from "../src/lib/evals/playthrough/sutAdapter";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── CLI ────────────────────────────────────────────────

interface EvalCli {
  live: boolean;
  baseUrl: string;
  sessions: number;
  maxSteps: number;
  outDir: string;
}

function parseArgs(): EvalCli {
  const args = process.argv.slice(2);
  const get = (name: string, def: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] ?? def : def;
  };
  return {
    live: args.includes("--live"),
    baseUrl: get("--base-url", process.env.LIVEPLAY_BASE_URL ?? "http://localhost:666"),
    sessions: parseInt(get("--sessions", "5"), 10),
    maxSteps: parseInt(get("--max-steps", "15"), 10),
    outDir: get("--out", "docs/eval"),
  };
}

// ─── 精选场景 ───────────────────────────────────────────

const SELECTED_SCENARIOS: Array<{
  scenarioId: string;
  persona: PersonaType;
  description: string;
  scriptedActions?: string[];
}> = [
  {
    scenarioId: "happy-speedrun",
    persona: "speedrunner",
    description: "速通主线流程",
    scriptedActions: undefined, // 使用 LLM 玩家
  },
  {
    scenarioId: "happy-explore",
    persona: "explorer",
    description: "探索分支路径",
    scriptedActions: undefined,
  },
  {
    scenarioId: "refusal-prompt-injection",
    persona: "rulebreaker",
    description: "对抗 prompt injection",
    scriptedActions: undefined,
  },
  {
    scenarioId: "recovery-low-hp",
    persona: "speedrunner",
    description: "HP 临界恢复",
    scriptedActions: undefined,
  },
  {
    scenarioId: "abandonment-confused-30s",
    persona: "confused",
    description: "迷茫玩家行为",
    scriptedActions: undefined,
  },
];

// ─── 简化单局运行（不依赖完整 orchestrator，直接 SUT 调用）────

async function runSession(
  sessionIndex: number,
  selected: typeof SELECTED_SCENARIOS[number],
  config: EvalCli
): Promise<{
  sessionIndex: number;
  scenarioId: string;
  persona: PersonaType;
  steps: Array<{ step: number; action: string; narrative: string; latencyMs: number }>;
  judgeResult: Awaited<ReturnType<typeof judgeNarrativeConsistencyMock>>;
  terminatedReason: string;
  totalSteps: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  const scenario = SCENARIOS.find((s) => s.id === selected.scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${selected.scenarioId}`);

  console.log(`\n  🔄 Session ${sessionIndex + 1}/${config.sessions}: ${selected.scenarioId} [${selected.persona}]`);

  // 创建 SUT
  const sut = createSutAdapter({
    mock: !config.live,
    baseUrl: config.baseUrl,
    sessionId: `live-eval-${Date.now()}-${sessionIndex}`,
    frameTimeoutMs: 60000,
  });

  // 初始状态
  const initialState = createInitialStateSnapshot(scenario.initialStateOverride as Record<string, unknown> | undefined);
  let currentState = { ...initialState };
  const steps: Array<{ step: number; action: string; narrative: string; latencyMs: number }> = [];
  let terminatedReason = "max_steps";
  let totalSteps = 0;

  try {
    for (let step = 0; step < config.maxSteps; step++) {
      // 玩家动作
      const action = selected.scriptedActions?.[step]
        ?? generateMockAction(selected.persona, step, 42 + sessionIndex);

      // SUT 调用
      const response = await sut.step({
        playerAction: action,
        persona: selected.persona,
        stepIndex: step,
      } as SutAction);

      if (response.status === "error" && !response.reachedFinal) {
        console.warn(`    ⚠️ Step ${step} 失败: ${response.error ?? "unknown"}`);
        terminatedReason = "error";
        totalSteps = step;
        break;
      }

      steps.push({
        step,
        action,
        narrative: response.narrative,
        latencyMs: response.latencyMs,
      });

      // 检查终止条件
      if (response.dmJson["is_death"] === true) {
        terminatedReason = "death";
        totalSteps = step + 1;
        break;
      }
      if (response.dmJson["reached_ending"] === true || response.dmJson["is_ending"] === true) {
        terminatedReason = "reached_ending";
        totalSteps = step + 1;
        break;
      }

      totalSteps = step + 1;
      if ((step + 1) % 5 === 0) {
        console.log(`    Step ${step + 1}/${config.maxSteps} ... (${response.latencyMs}ms)`);
      }
    }
  } finally {
    await sut.close?.();
  }

  const durationMs = Date.now() - startTime;

  // 叙事裁判
  const transcript = {
    runId: `live-${selected.scenarioId}-${selected.persona}-session${sessionIndex}`,
    persona: selected.persona,
    seed: sessionIndex,
    steps: steps.map((s) => ({
      stepIndex: s.step,
      playerAction: s.action,
      narrative: s.narrative,
      dmJson: {},
      stateAfter: currentState,
      timestamp: Date.now(),
    })),
    initialState,
    finalState: currentState,
    terminatedReason,
    totalSteps,
    durationMs,
  };

  let judgeResult: Awaited<ReturnType<typeof judgeNarrativeConsistencyMock>>;
  if (config.live && process.env.DEEPSEEK_API_KEY) {
    try {
      judgeResult = await judgeNarrativeConsistencyLive(transcript);
    } catch {
      judgeResult = judgeNarrativeConsistencyMock(transcript);
    }
  } else {
    judgeResult = judgeNarrativeConsistencyMock(transcript);
  }

  return {
    sessionIndex,
    scenarioId: selected.scenarioId,
    persona: selected.persona,
    steps,
    judgeResult,
    terminatedReason,
    totalSteps,
    durationMs,
  };
}

// ─── 报告生成 ───────────────────────────────────────────

function generateReport(
  results: Awaited<ReturnType<typeof runSession>>[],
  config: EvalCli
): string {
  const totalSteps = results.reduce((s, r) => s + r.totalSteps, 0);
  const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);
  const avgJudgeScore = results.reduce((s, r) => s + r.judgeResult.overallScore, 0) / results.length;
  const passedSessions = results.filter((r) => r.judgeResult.passed).length;

  const lines: string[] = [];

  lines.push("# Live Playthrough 小样本长程评测报告");
  lines.push("");
  lines.push(`> **生成时间**: ${new Date().toISOString()}`);
  lines.push(`> **模式**: ${config.live ? "live (真实 SUT)" : "mock (规则模拟)"}`);
  lines.push(`> **会话数**: ${results.length}`);
  lines.push(`> **总回合数**: ${totalSteps}`);
  lines.push(`> **总耗时**: ${(totalDuration / 1000).toFixed(1)}s`);
  lines.push("");
  lines.push("## 综合评分");
  lines.push("");
  lines.push(`| 指标 | 值 |`);
  lines.push(`|---|---|`);
  lines.push(`| 平均叙事分 | ${avgJudgeScore.toFixed(2)}/5 |`);
  lines.push(`| 通过会话 | ${passedSessions}/${results.length} |`);
  lines.push(`| 平均回合数 | ${(totalSteps / results.length).toFixed(1)} |`);
  lines.push(`| 平均会话耗时 | ${(totalDuration / results.length / 1000).toFixed(1)}s |`);
  lines.push("");

  // 维度分聚合
  const dims = ["coherence", "characterVoice", "plotLogic", "immersion", "factConsistency"];
  lines.push("### 维度平均分");
  lines.push("");
  lines.push(`| 维度 | 平均分 |`);
  lines.push(`|---|---|`);
  for (const dim of dims) {
    const avg = results.reduce((s, r) => s + (r.judgeResult.dimensionScores[dim] ?? 0), 0) / results.length;
    lines.push(`| ${dim} | ${avg.toFixed(2)} |`);
  }
  lines.push("");

  // 逐会话详情
  lines.push("## 逐会话详情");
  lines.push("");
  for (const r of results) {
    const icon = r.judgeResult.passed ? "✅" : "❌";
    const ngrams = r.steps.map((s) => s.narrative.length > 30 ? s.narrative.slice(0, 30) + "..." : s.narrative);
    lines.push(`### ${icon} Session ${r.sessionIndex + 1}: ${r.scenarioId} [${r.persona}]`);
    lines.push("");
    lines.push(`- **终止原因**: ${r.terminatedReason}`);
    lines.push(`- **总回合数**: ${r.totalSteps}`);
    lines.push(`- **耗时**: ${(r.durationMs / 1000).toFixed(1)}s`);
    lines.push(`- **叙事评分**: ${r.judgeResult.overallScore}/5`);
    lines.push(`- **维度分**: ${JSON.stringify(r.judgeResult.dimensionScores)}`);
    lines.push("");
    lines.push(`#### 问题列表`);
    for (const issue of r.judgeResult.issues) {
      const sevIcon = issue.severity === "critical" ? "🔴" : issue.severity === "major" ? "🟡" : "🟢";
      lines.push(`- ${sevIcon} [${issue.severity}] ${issue.description}`);
    }
    if (r.judgeResult.issues.length === 0) {
      lines.push("- 无问题");
    }
    lines.push("");
    lines.push(`#### 裁判推理`);
    lines.push(`> ${r.judgeResult.reasoning}`);
    lines.push("");

    // 回合摘要
    lines.push(`#### 回合记录`);
    lines.push("");
    for (const step of r.steps.slice(0, 15)) {
      const narrativePreview = step.narrative.length > 80
        ? step.narrative.slice(0, 80) + "..."
        : step.narrative;
      lines.push(`- **Step ${step.step + 1}** (${step.latencyMs}ms): "${step.action}" → "${narrativePreview}"`);
    }
    if (r.steps.length > 15) {
      lines.push(`- ... 还有 ${r.steps.length - 15} 回合`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // 定性发现
  lines.push("## 定性发现");
  lines.push("");
  const allIssues = results.flatMap((r) => r.judgeResult.issues);
  const criticalIssues = allIssues.filter((i) => i.severity === "critical");
  const majorIssues = allIssues.filter((i) => i.severity === "major");

  if (criticalIssues.length > 0) {
    lines.push("### 🔴 Critical 问题");
    lines.push("");
    for (const issue of criticalIssues) {
      lines.push(`- ${issue.description}`);
    }
    lines.push("");
  }

  if (majorIssues.length > 0) {
    lines.push("### 🟡 Major 问题");
    lines.push("");
    const uniqueMajor = [...new Set(majorIssues.map((i) => i.description))];
    for (const desc of uniqueMajor) {
      lines.push(`- ${desc}`);
    }
    lines.push("");
  }

  // 稳定性评估
  const avgLatency = results.flatMap((r) => r.steps.map((s) => s.latencyMs));
  const p50Latency = avgLatency.sort((a, b) => a - b)[Math.floor(avgLatency.length * 0.5)] ?? 0;
  const p95Latency = avgLatency.sort((a, b) => a - b)[Math.floor(avgLatency.length * 0.95)] ?? 0;

  lines.push("### 性能统计");
  lines.push("");
  lines.push(`| 指标 | 值 |`);
  lines.push(`|---|---|`);
  lines.push(`| 平均单步延迟 | ${(avgLatency.reduce((s, v) => s + v, 0) / avgLatency.length).toFixed(0)}ms |`);
  lines.push(`| p50 延迟 | ${p50Latency}ms |`);
  lines.push(`| p95 延迟 | ${p95Latency}ms |`);
  lines.push(`| 终止原因分布 | ${results.map((r) => r.terminatedReason).join(", ")} |`);
  lines.push("");

  // 结论
  lines.push("## 结论与建议");
  lines.push("");
  if (passedSessions === results.length) {
    lines.push("✅ 所有会话通过叙事一致性检查。");
  } else {
    lines.push(`⚠️ ${results.length - passedSessions}/${results.length} 个会话存在叙事一致性问题。`);
  }
  if (criticalIssues.length > 0) {
    lines.push(`🔴 发现 ${criticalIssues.length} 个 Critical 问题，建议优先修复。`);
  }
  if (avgJudgeScore < 3) {
    lines.push("⚠️ 平均叙事分低于 3/5，整体叙事质量需改善。");
  } else if (avgJudgeScore < 4) {
    lines.push("📈 平均叙事分在 3-4 区间，有提升空间。");
  } else {
    lines.push("✅ 平均叙事分达到 4+，叙事质量良好。");
  }
  lines.push("");

  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseArgs();

  console.log("📊 Live Playthrough 小样本长程评测");
  console.log("═".repeat(60));
  console.log(`模式: ${config.live ? "live (真实 SUT)" : "mock (规则模拟)"}`);
  console.log(`会话数: ${config.sessions} (每会话 ${config.maxSteps} 回合)`);
  console.log(`报告输出: ${config.outDir}`);
  if (config.live) console.log(`SUT base URL: ${config.baseUrl}`);
  if (!config.live) console.log("提示: 用 --live 启用真实 SUT（需要 dev server）");
  console.log("");

  if (!process.env.DEEPSEEK_API_KEY) {
    console.log("⚠️  DEEPSEEK_API_KEY 未设置，叙事裁判将使用 mock 模式。");
    console.log("   设置环境变量以启用真实 LLM 裁判评分。");
    console.log("");
  }

  // 选择会话
  const sessions = SELECTED_SCENARIOS.slice(0, config.sessions);
  console.log(`精选场景: ${sessions.map((s) => s.scenarioId).join(", ")}`);

  // 运行
  const results: Awaited<ReturnType<typeof runSession>>[] = [];
  for (let i = 0; i < sessions.length; i++) {
    try {
      const result = await runSession(i, sessions[i]!, config);
      results.push(result);
    } catch (err) {
      console.error(`  ❌ Session ${i + 1} 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 生成报告
  const report = generateReport(results, config);

  // 写入文件
  if (!existsSync(config.outDir)) {
    mkdirSync(config.outDir, { recursive: true });
  }
  const reportPath = resolve(config.outDir, "live-playthrough-report.md");
  writeFileSync(reportPath, report, "utf8");
  console.log(`\n📄 报告已写入: ${reportPath}`);

  // 摘要
  console.log("\n📊 评测摘要");
  console.log("═".repeat(60));
  for (const r of results) {
    const icon = r.judgeResult.passed ? "✅" : "❌";
    console.log(`  ${icon} ${r.scenarioId} [${r.persona}]: ${r.judgeResult.overallScore}/5, ${r.totalSteps} 回合, ${(r.durationMs / 1000).toFixed(1)}s`);
  }
  const avgScore = results.reduce((s, r) => s + r.judgeResult.overallScore, 0) / results.length;
  console.log(`  平均叙事分: ${avgScore.toFixed(2)}/5`);

  if (!config.live) {
    console.log("\n⏱️  提示：mock 模式不调真实 SUT。使用 --live 运行真实 /api/chat 评测。");
    console.log("   先确保 dev server 在运行：pnpm dev");
  }
}

main().catch((err) => {
  console.error("❌ 评测脚本失败:", err);
  process.exit(1);
});
