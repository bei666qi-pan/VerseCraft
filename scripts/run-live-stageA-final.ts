#!/usr/bin/env tsx
/**
 * Stage A 最终版 — 三系统串行真实运行
 *
 * 关键修复：
 * - SUT DM 模型 ac-deepseek-v4-flash ✅
 * - One-api warmup ✅
 * - 步数 200（触发武器/职业/战斗核心机制，总时长 ~5h）
 * - 紧凑步延迟 2s（DM 实际是瓶颈，2s 足够）
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

async function warmupDeepSeek(): Promise<void> {
  console.log("🔥 Warmup DeepSeek API...");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await callDeepSeekCompletion({
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 5, timeoutMs: 180000,
      });
      console.log(`   ✅ warmup 成功 (${resp.latencyMs}ms, ${resp.model})`);
      return;
    } catch (err) {
      console.warn(`   ⚠️ warmup 第${attempt + 1}次失败: ${err instanceof Error ? err.message : String(err)}`);
      if (attempt < 2) { await new Promise((r) => setTimeout(r, 30000)); }
    }
  }
}

async function runOneSystem(system: SystemGroup): Promise<void> {
  const MAX_STEPS = parseInt(process.env.LIVE_MAX_STEPS ?? "200", 10);
  const RUNS = parseInt(process.env.LIVE_RUNS ?? "1", 10);

  const personas = system.personas as PersonaType[];
  const totalRuns = personas.length * system.scenarioIds.length * RUNS;
  const totalApiCalls = totalRuns * MAX_STEPS * 2;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${system.emoji} ${system.name}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  场景: ${system.scenarioIds.join(", ")}`);
  console.log(`  Persona: ${personas.join(", ")}`);
  console.log(`  每局: ${MAX_STEPS} 步 × ${RUNS} 局`);
  console.log(`  预计 LLM 调用: ${totalApiCalls} 次`);
  console.log(`  softlock 阈值: 40`);

  const config: PlaythroughV3Config = {
    scenarioIds: system.scenarioIds,
    personas,
    runsPerPersona: RUNS,
    maxStepsPerRun: MAX_STEPS,
    baseSeed: Date.now(),
    mockMode: false,
    baseUrl: VERSE_CRAFT_URL,
    runNarrativeJudge: false,
    softlockThreshold: 60,  // 60 步：宽松，避免剧情式叙事误判
    stepTimeoutMs: 300000,
    traceOutputDir: `.runtime-data/playthrough/live-${system.name}`,
    enableFailureClustering: true,
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
      console.log(`    📊 ${sid}: ${sc.passed}/${sc.total} | avgSteps=${sc.avgSteps.toFixed(0)}`);
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
  console.log("🎮 VerseCraft Stage A 最终版");
  console.log(`   服务端: ${VERSE_CRAFT_URL}`);
  console.log(`   模型: ac-deepseek-v4-flash (via one-api)`);
  console.log(`   每局上限: ${parseInt(process.env.LIVE_MAX_STEPS ?? "200", 10)} 步`);
  console.log(`   时间: ${new Date().toLocaleString()}`);
  console.log("");

  // 验证 SUT
  const res = await fetch(`${VERSE_CRAFT_URL}/`, { signal: AbortSignal.timeout(5000) });
  console.log(`   ✅ SUT 可达: HTTP ${res.status}`);

  // Warmup
  await warmupDeepSeek();

  const overallStart = Date.now();
  let okCount = 0;

  for (const sys of SYSTEMS) {
    for (let attempt = 0; attempt <= 1; attempt++) {
      if (attempt > 0) {
        console.log(`\n🔄 重试 ${sys.name}（第 2 次）...\n`);
        await new Promise((r) => setTimeout(r, 15000));
      }
      try {
        await runOneSystem(sys);
        okCount++;
        break;
      } catch (err) {
        if (attempt < 1) {
          console.error(`  ⚠️ 重试中: ${err instanceof Error ? err.message : String(err)}`);
        } else {
          console.error(`  ❌ 放弃: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  const totalHours = ((Date.now() - overallStart) / 3600000).toFixed(1);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ Stage A 完成 (${okCount}/${SYSTEMS.length})`);
  console.log(`   ${totalHours}h`);
  console.log(`   Trace: .runtime-data/playthrough/live-*`);
  console.log(`   时间: ${new Date().toLocaleString()}`);
  console.log(`${"═".repeat(60)}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
