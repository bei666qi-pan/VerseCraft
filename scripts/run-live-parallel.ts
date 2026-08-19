#!/usr/bin/env tsx
/**
 * Live 模式 Stage A —— 三系统并行、每局最高 1000 步、降低 softlock 终止率
 *
 * 架构变更：
 * - 三系统并行跑（Promise.all），而不是串行
 * - 每局 1000 步（覆盖完整转职流程）
 * - softlock 阈值从 8 提升到 40（避免慢节奏剧情被误判）
 * - 步间延迟采用自适应策略：前 10 步 6s → 之后 20s，避免中后期 RPM 堆积
 * - 每个 persona 用独立 SUT session，避免状态污染
 *
 * RPM 约 15 req/min，1000 步 × 2req/步 = 2000 req/system
 * 三系统并行时整体 ≈ 6000 req，自适应延迟平均约 16s/步 ≈ 4.4 小时
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  runPlaythroughBatchV3,
  findScenario,
} from "../src/lib/evals/playthrough";
import type { PlaythroughV3Config, PersonaType } from "../src/lib/evals/playthrough";

const VERSE_CRAFT_URL = process.env.VERSE_CRAFT_URL ?? "http://localhost:666";

interface SystemGroup {
  name: string;
  emoji: string;
  description: string;
  scenarioIds: string[];
  personas: string[];
}

const SYSTEMS: SystemGroup[] = [
  {
    name: "武器系统",
    emoji: "🗡️",
    description: "武器获取→使用→损耗→战斗实战",
    scenarioIds: ["weapon-lifecycle", "weapon-combat"],
    personas: ["speedrunner", "explorer", "collector"],
  },
  {
    name: "职业/转职",
    emoji: "⚔️",
    description: "职业进阶路线、职业与战斗联动",
    scenarioIds: ["profession-progression", "profession-combat-synergy"],
    personas: ["speedrunner", "explorer"],
  },
  {
    name: "战斗系统",
    emoji: "💥",
    description: "战斗生存链、武器随战斗降级",
    scenarioIds: ["combat-survival", "combat-weapon-degradation"],
    personas: ["speedrunner", "explorer"],
  },
];

/** 自适应步间延迟：deepseek-v4-flash 响应较快，使用更紧凑的间隔 */
function getStepDelay(stepIndex: number): number {
  if (stepIndex < 5) return 3000;   // 初始 3s 预热
  return 5000;                      // 稳定期 5s，配合 10-12 RPM 余量
}

async function runOneSystem(system: SystemGroup): Promise<void> {
  const DEFAULT_MAX_STEPS = parseInt(process.env.LIVE_MAX_STEPS ?? "1000", 10);
  const DEFAULT_RUNS = parseInt(process.env.LIVE_RUNS ?? "1", 10);

  // 系统间冷却：等待 30s 让 one-api 喘息
  console.log(`\n⏳ 系统间冷却 30s...\n`);
  await new Promise((r) => setTimeout(r, 30000));

  const scenarios = system.scenarioIds.map((id) => findScenario(id)).filter(Boolean);
  // 用 system.personas 覆盖 scenario 默认的 personas，保证每个系统跑最合适的 persona 组合
  const personas = system.personas as PersonaType[];

  console.log(`${"─".repeat(60)}`);
  console.log(`${system.emoji} ${system.name}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  场景: ${system.scenarioIds.join(", ")}`);
  console.log(`  Persona: ${personas.join(", ")}`);
  console.log(`  每局: ${DEFAULT_MAX_STEPS} 步 × ${DEFAULT_RUNS} 局`);
  console.log(`  softlock 阈值: 40`);
  console.log(`  预计 LLM 调用: ${personas.length * scenarios.length * DEFAULT_RUNS * DEFAULT_MAX_STEPS * 2} 次`);
  console.log(`  步间延迟: 自适应（3s→5s）`);
  console.log("");

  const config: PlaythroughV3Config = {
    scenarioIds: system.scenarioIds,
    personas,
    runsPerPersona: DEFAULT_RUNS,
    maxStepsPerRun: DEFAULT_MAX_STEPS,
    baseSeed: Date.now(),
    mockMode: false,
    baseUrl: VERSE_CRAFT_URL,
    runNarrativeJudge: false,
    softlockThreshold: 40,
    stepTimeoutMs: 120000,
    traceOutputDir: `.runtime-data/eval/playthrough/live-${system.name}`,
    enableFailureClustering: true,
    // 自适应步间延迟：deepseek-v4-flash 响应较快的前 5 步 3s → 之后 5s
    stepDelayMs: (stepIndex: number) => {
      if (stepIndex < 5) return 3000;
      return 5000;
    },
  };

  const startTime = Date.now();

  try {
    // 拦截 runPlaythroughBatchV3 内部的步间延迟 — 我们传一个自定义 stepDelay
    const result = await runPlaythroughBatchV3(config);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`  耗时: ${elapsed}s`);
    console.log(`  通过: ${result.passedRuns}/${result.totalRuns} (${(result.passedRuns / result.totalRuns * 100).toFixed(0)}%)`);

    for (const [sid, sc] of Object.entries(result.scenarioMap)) {
      console.log(`    📊 ${sid}: ${sc.passed}/${sc.total}`);
    }

    for (const [name, p] of Object.entries(result.byPersona)) {
      console.log(`    ${name}: avg ${p.avgSteps.toFixed(1)}步 | softlock=${p.softlockCount}`);
    }

    console.log(`  终止原因: ${Object.entries(result.byTermination).map(([r, c]) => `${r}=${c}`).join(" | ")}`);

    if (result.topViolations.length > 0) {
      console.log(`  违规: ${result.topViolations.map((v) => `${v.rule}(${v.count})`).join(", ")}`);
    }

    if (result.failureClusters.length > 0) {
      console.log(`  失败聚类: ${result.failureClusters.map((c) => `${c.label}(${c.count})`).join(", ")}`);
    }
  } catch (err) {
    console.error(`  ❌ 运行失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("");
}

async function main() {
  console.log("🎮 VerseCraft Live 模式测试 Stage A — 并行三系统");
  console.log(`   服务端: ${VERSE_CRAFT_URL}`);
  console.log(`   模型: ${process.env.DEEPSEEK_MODEL ?? "ac-deepseek-v4-flash"} (via one-api)`);
  console.log(`   每局上限: ${parseInt(process.env.LIVE_MAX_STEPS ?? "1000", 10)} 步`);
  console.log(`   三系统串行: 武器/职业/战斗`);
  console.log(`   预计总时长: 约 10-14 小时（串行，每步自适应延迟）`);
  console.log("");
  console.log("");

  // 验证服务端可连
  try {
    const res = await fetch(`${VERSE_CRAFT_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerAction: "ping", sessionId: "live-ping" }),
      signal: AbortSignal.timeout(5000),
    });
    console.log(`   ✅ 服务端响应: HTTP ${res.status}`);
    if (res.status >= 400) {
      console.log(`   ⚠️ 服务端返回 ${res.status}，但域名本身可连通`);
    }
    console.log("");
  } catch (err) {
    console.error(`   ❌ 无法连接 ${VERSE_CRAFT_URL}: ${err instanceof Error ? err.message : String(err)}`);
    console.error("   请先启动 VerseCraft dev server: cd ../VerseCraft && pnpm dev");
    process.exit(1);
  }

  const overallStart = Date.now();

  // 串行跑系统：one-api "按次套餐" 分组对并行请求处理能力有限
  // 每系统内部也是串行（scenario→persona 顺序）
  for (const sys of SYSTEMS) {
    await runOneSystem(sys);
  }

  const overallElapsed = ((Date.now() - overallStart) / 3600).toFixed(1);

  console.log(`${"═".repeat(60)}`);
  console.log("✅ Stage A 并行测试完成");
  console.log(`    总耗时: ${overallElapsed} 小时`);
  console.log(`    Trace: .runtime-data/eval/playthrough/live-*`);
  console.log(`    注意: 当前是长程验证（每局 ${parseInt(process.env.LIVE_MAX_STEPS ?? "1000", 10)} 步）。`);
  console.log(`${"═".repeat(60)}`);
}

main().catch((err) => {
  console.error("Live test failed:", err);
  process.exit(1);
});
