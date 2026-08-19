#!/usr/bin/env tsx
/**
 * Stage A 可靠运行脚本 — 三系统串行，带 warmup 和健壮 retry
 *
 * 关键修复：
 * - SUT DM 模型名已修复 deepseek-v4-flash → ac-deepseek-v4-flash ✅
 * - 正式启动前做一次 DeepSeek API warmup（one-api 冷启动需 ~2min）
 * - 使用优化步延迟 2s（非 5s），减少不必要的空闲等待
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  runPlaythroughBatchV3,
  findScenario,
} from "../src/lib/evals/playthrough";
import type { PlaythroughV3Config, PersonaType } from "../src/lib/evals/playthrough";
import { callDeepSeekCompletion } from "../src/lib/evals/liveProvider";

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

/** Warmup: 确保 one-api DeepSeek 通道已就绪 */
async function warmupDeepSeek(): Promise<void> {
  console.log("🔥 Warmup DeepSeek API...");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await callDeepSeekCompletion({
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 5,
        timeoutMs: 180000,  // 冷启动需要：180s 超时
      });
      console.log(`   ✅ warmup 成功 (${resp.latencyMs}ms, ${resp.model})`);
      return;
    } catch (err) {
      console.warn(`   ⚠️ warmup 第${attempt + 1}次失败: ${err instanceof Error ? err.message : String(err)}`);
      if (attempt < 2) {
        console.log("   等待 30s 再试...");
        await new Promise((r) => setTimeout(r, 30000));
      }
    }
  }
  console.error("   ❌ warmup 耗尽，但将继续尝试运行");
}

async function runOneSystem(system: SystemGroup): Promise<void> {
  const DEFAULT_MAX_STEPS = parseInt(process.env.LIVE_MAX_STEPS ?? "500", 10);
  const DEFAULT_RUNS = parseInt(process.env.LIVE_RUNS ?? "1", 10);

  const scenarios = system.scenarioIds.map((id) => findScenario(id)).filter(Boolean);
  const personas = system.personas as PersonaType[];

  const totalRuns = personas.length * scenarios.length * DEFAULT_RUNS;
  const totalApiCalls = totalRuns * DEFAULT_MAX_STEPS * 2;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${system.emoji} ${system.name}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  场景: ${system.scenarioIds.join(", ")}`);
  console.log(`  Persona: ${personas.join(", ")}`);
  console.log(`  每局: ${DEFAULT_MAX_STEPS} 步 × ${DEFAULT_RUNS} 局 × ${scenarios.length}场景 × ${personas.length}persona`);
  console.log(`  softlock 阈值: 40`);
  console.log(`  预计 LLM 调用: ${totalApiCalls} 次`);
  console.log(`  步间延迟: 紧凑（2s）`);

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
    stepTimeoutMs: 180000,
    traceOutputDir: `.runtime-data/eval/playthrough/live-${system.name}`,
    enableFailureClustering: true,
    // 紧凑步延迟：2s，比之前的 5s 减少 60% 空闲等待
    stepDelayMs: 2000,
  };

  const startTime = Date.now();

  try {
    const result = await runPlaythroughBatchV3(config);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n  📊 ${system.name} 完成`);
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
  console.log("🎮 VerseCraft Stage A 真实运行 — 三系统");
  console.log(`   服务端: ${VERSE_CRAFT_URL}`);
  console.log(`   模型: ${process.env.DEEPSEEK_MODEL ?? "ac-deepseek-v4-flash"} (via one-api)`);
  console.log(`   每局上限: ${parseInt(process.env.LIVE_MAX_STEPS ?? "500", 10)} 步`);
  console.log(`   系统: 武器(3p)/职业(2p)/战斗(2p) 串行`);
  console.log(`   时间: ${new Date().toLocaleString()}`);
  console.log("");

  // 1) 验证 SUT 可连
  try {
    const res = await fetch(`${VERSE_CRAFT_URL}/`, { signal: AbortSignal.timeout(5000) });
    console.log(`   ✅ SUT 可达: HTTP ${res.status}`);
  } catch (err) {
    console.error(`   ❌ SUT ${VERSE_CRAFT_URL} 不可达`);
    process.exit(1);
  }

  // 2) Warmup DeepSeek API
  await warmupDeepSeek();

  // 3) 运行三系统
  const overallStart = Date.now();
  let successCount = 0;
  let failCount = 0;

  for (const sys of SYSTEMS) {
    const MAX_RETRIES = 1;
    let ok = false;
    for (let attempt = 0; attempt <= MAX_RETRIES && !ok; attempt++) {
      if (attempt > 0) {
        console.log(`\n🔄 重试 ${sys.name}（第 ${attempt}/${MAX_RETRIES} 次）...\n`);
        await new Promise((r) => setTimeout(r, 15000));
      }
      try {
        await runOneSystem(sys);
        ok = true;
        successCount++;
      } catch (err) {
        console.error(`  ❌ ${sys.name} 失败: ${err instanceof Error ? err.message : String(err)}`);
        failCount++;
      }
    }
    // 系统间冷却
    console.log(`   ⏳ 冷却 10s...`);
    await new Promise((r) => setTimeout(r, 10000));
  }

  const totalHours = ((Date.now() - overallStart) / 3600000).toFixed(1);

  console.log(`\n${"═".repeat(60)}`);
  console.log("✅ Stage A 完成");
  console.log(`   总耗时: ${totalHours} 小时`);
  console.log(`   成功: ${successCount}/${SYSTEMS.length}`);
  console.log(`   Trace: .runtime-data/eval/playthrough/live-*`);
  console.log(`   时间: ${new Date().toLocaleString()}`);
  console.log(`${"═".repeat(60)}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
