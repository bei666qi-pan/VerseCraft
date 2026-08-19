#!/usr/bin/env tsx
/**
 * 接续 Stage A —— 只跑职业/转职 + 战斗系统
 * 武器系统已在上一轮完成（5/5 通过）
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

// 只跑剩余系统
const SYSTEMS: SystemGroup[] = [
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

async function runOneSystem(system: SystemGroup): Promise<void> {
  const DEFAULT_MAX_STEPS = parseInt(process.env.LIVE_MAX_STEPS ?? "1000", 10);
  const DEFAULT_RUNS = parseInt(process.env.LIVE_RUNS ?? "1", 10);

  const scenarios = system.scenarioIds.map((id) => findScenario(id)).filter(Boolean);
  const personas = system.personas as PersonaType[];

  console.log(`${"─".repeat(60)}`);
  console.log(`${system.emoji} ${system.name}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  场景: ${system.scenarioIds.join(", ")}`);
  console.log(`  Persona: ${personas.join(", ")}`);
  console.log(`  每局: ${DEFAULT_MAX_STEPS} 步 × ${DEFAULT_RUNS} 局`);
  console.log(`  softlock 阈值: 40`);
  console.log(`  预计 LLM 调用: ${personas.length * scenarios.length * DEFAULT_RUNS * DEFAULT_MAX_STEPS * 2} 次`);
  console.log(`  步间延迟: 5s`);
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
    stepTimeoutMs: 180000, // 180s：one-api 冷启动可能需 2min+
    traceOutputDir: `.runtime-data/eval/playthrough/live-${system.name}`,
    enableFailureClustering: true,
    stepDelayMs: 5000,  // 固定 5s 步间延迟
  };

  const startTime = Date.now();

  try {
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
  console.log("🎮 VerseCraft Stage A（续） — 职业/战斗系统");
  console.log(`   服务端: ${VERSE_CRAFT_URL}`);
  console.log(`   模型: ${process.env.DEEPSEEK_MODEL ?? "ac-deepseek-v4-flash"} (via one-api)`);
  console.log(`   武器系统 ✅ 已完成（5/5 通过）`);
  console.log("");

  const MAX_RETRIES = 2;

  for (const sys of SYSTEMS) {
    let success = false;
    for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
      if (attempt > 0) {
        console.log(`\n🔄 重试 ${sys.name}（第 ${attempt}/${MAX_RETRIES} 次）......\n`);
      }
      try {
        await runOneSystem(sys);
        success = true;
      } catch (err) {
        console.error(`  ❌ ${sys.name} 失败: ${err instanceof Error ? err.message : String(err)}`);
        if (attempt < MAX_RETRIES) {
          console.log("  等待 60s 后重试...");
          await new Promise((r) => setTimeout(r, 60000));
        }
      }
    }
  }

  console.log(`${"═".repeat(60)}`);
  console.log("✅ Stage A（续）完成");
  console.log(`    武器系统: ✅ 5/5`);
  console.log(`    职业/转职 + 战斗: 见上方输出`);
  console.log(`    Trace: .runtime-data/eval/playthrough/live-*`);
  console.log(`${"═".repeat(60)}`);
}

main().catch((err) => {
  console.error("Live test failed:", err);
  process.exit(1);
});
