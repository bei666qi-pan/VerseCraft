#!/usr/bin/env tsx
/**
 * Stage A 最终版 — 三系统串行真实运行
 *
 * 关键修复：
 * - SUT DM 模型 ac-deepseek-v4-flash ✅
 * - One-api warmup ✅
 * - 步数 200（触发武器/职业/战斗核心机制，总时长 ~5h）
 * - 紧凑步延迟 2s（DM 实际是瓶颈，2s 足够）
 *
 * v2 改进（已合并）：
 * - 全局 uncaughtException / unhandledRejection 处理
 * - 日志写入物理文件（同时 stdout）
 * - 每步心跳日志 + 强制 flush
 * - warmup 超时缩短到 60s
 */

import { config } from "dotenv";
import { writeFileSync } from "fs";

config({ path: ".env.local" });

// 全局错误处理 - 写入日志文件
process.on("uncaughtException", (err) => {
  const msg = `\n[FATAL] uncaughtException: ${err.message}\n${err.stack}\n`;
  try { writeFileSync("/tmp/stageA-fatal.log", msg, { flag: "a" }); } catch {}
  console.error(msg);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  const msg = `\n[FATAL] unhandledRejection: ${reason instanceof Error ? reason.message : String(reason)}\n${reason instanceof Error ? reason.stack : ""}\n`;
  try { writeFileSync("/tmp/stageA-fatal.log", msg, { flag: "a" }); } catch {}
  console.error(msg);
  process.exit(1);
});

// 心跳日志
const LOG_HEARTBEAT = "/tmp/stageA-heartbeat.log";
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
function startHeartbeat(label: string) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  const start = Date.now();
  heartbeatInterval = setInterval(() => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    writeFileSync(LOG_HEARTBEAT, `${new Date().toISOString()} [${label}] alive ${elapsed}s\n`, { flag: "a" });
  }, 30000);
}
function stopHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
}

import {
  runPlaythroughBatchV3,
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

function log(msg: string) {
  console.log(msg);
  try {
    writeFileSync("/tmp/stageA-trace.log", `${new Date().toISOString()} ${msg}\n`, { flag: "a" });
  } catch {}
}

async function warmupDeepSeek(): Promise<void> {
  log("🔥 Warmup DeepSeek API...");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await callDeepSeekCompletion({
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 5, timeoutMs: 60000,
      });
      log(`   ✅ warmup 成功 (${resp.latencyMs}ms, ${resp.model})`);
      return;
    } catch (err) {
      log(`   ⚠️ warmup 第${attempt + 1}次失败: ${err instanceof Error ? err.message : String(err)}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 30000));
    }
  }
}

async function runOneSystem(system: SystemGroup): Promise<void> {
  const MAX_STEPS = parseInt(process.env.LIVE_MAX_STEPS ?? "200", 10);
  const RUNS = parseInt(process.env.LIVE_RUNS ?? "1", 10);

  const personas = system.personas as PersonaType[];
  const totalRuns = personas.length * system.scenarioIds.length * RUNS;
  const totalApiCalls = totalRuns * MAX_STEPS * 2;

  log(`\n${"─".repeat(60)}`);
  log(`${system.emoji} ${system.name}`);
  log(`${"─".repeat(60)}`);
  log(`  场景: ${system.scenarioIds.join(", ")}`);
  log(`  Persona: ${personas.join(", ")}`);
  log(`  每局: ${MAX_STEPS} 步 × ${RUNS} 局`);
  log(`  预计 LLM 调用: ${totalApiCalls} 次`);
  log(`  softlock 阈值: 60`);

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

    log(`\n  📊 ${system.name} 完成`);
    log(`  耗时: ${elapsed}s`);
    log(`  通过: ${result.passedRuns}/${result.totalRuns} (${(result.passedRuns / result.totalRuns * 100).toFixed(0)}%)`);

    for (const [sid, sc] of Object.entries(result.scenarioMap)) {
      log(`    📊 ${sid}: ${sc.passed}/${sc.total} | avgSteps=${sc.avgSteps.toFixed(0)}`);
    }
    for (const [name, p] of Object.entries(result.byPersona)) {
      log(`    ${name}: avg ${p.avgSteps.toFixed(1)}步 | softlock=${p.softlockCount}`);
    }
    log(`  终止原因: ${Object.entries(result.byTermination).map(([r, c]) => `${r}=${c}`).join(" | ")}`);
    if (result.topViolations.length > 0) {
      log(`  违规: ${result.topViolations.map((v) => `${v.rule}(${v.count})`).join(", ")}`);
    }
    if (result.failureClusters.length > 0) {
      log(`  失败聚类: ${result.failureClusters.map((c) => `${c.label}(${c.count})`).join(", ")}`);
    }
  } catch (err) {
    log(`  ❌ 运行失败: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) {
      log(`  Stack: ${err.stack.slice(0, 500)}`);
    }
  }
  log("");
}

async function main() {
  log("🎮 VerseCraft Stage A 最终版");
  log(`   服务端: ${VERSE_CRAFT_URL}`);
  log(`   模型: ac-deepseek-v4-flash (via one-api)`);
  log(`   每局上限: ${parseInt(process.env.LIVE_MAX_STEPS ?? "200", 10)} 步`);
  log(`   时间: ${new Date().toLocaleString()}`);
  log("");

  // 验证 SUT
  log("检查 SUT...");
  const res = await fetch(`${VERSE_CRAFT_URL}/`, { signal: AbortSignal.timeout(5000) });
  log(`   ✅ SUT 可达: HTTP ${res.status}`);

  // Warmup
  await warmupDeepSeek();

  const overallStart = Date.now();
  let okCount = 0;

  for (const sys of SYSTEMS) {
    for (let attempt = 0; attempt <= 1; attempt++) {
      if (attempt > 0) {
        log(`\n🔄 重试 ${sys.name}（第 2 次）...\n`);
        await new Promise((r) => setTimeout(r, 15000));
      }
      try {
        startHeartbeat(sys.name);
        await runOneSystem(sys);
        stopHeartbeat();
        okCount++;
        break;
      } catch (err) {
        stopHeartbeat();
        if (attempt < 1) {
          log(`  ⚠️ 重试中: ${err instanceof Error ? err.message : String(err)}`);
        } else {
          log(`  ❌ 放弃: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  const totalHours = ((Date.now() - overallStart) / 3600000).toFixed(1);
  log(`\n${"═".repeat(60)}`);
  log(`✅ Stage A 完成 (${okCount}/${SYSTEMS.length})`);
  log(`   ${totalHours}h`);
  log(`   时间: ${new Date().toLocaleString()}`);
  log(`${"═".repeat(60)}`);
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) log(`Stack: ${err.stack}`);
  process.exit(1);
});
