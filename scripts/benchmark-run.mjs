#!/usr/bin/env node

/**
 * benchmark-run.mjs — VerseCraft 统一基准测试跑分器
 *
 * 用法：
 *   node scripts/benchmark-run.mjs              # 完整跑分（mock 模式）
 *   node scripts/benchmark-run.mjs --track=narrative_quality  # 只跑指定 track
 *   node scripts/benchmark-run.mjs --baseline=.runtime-data/benchmark-latest.json  # 与基线对比
 *   node scripts/benchmark-run.mjs --ci         # CI 模式（严格退出码）
 *   node scripts/benchmark-run.mjs --json-only  # 仅输出 JSON
 *
 * 与 test-gate 的区别：
 *   - test-gate 做 pass/fail 阻断（适合 CI pre-merge）
 *   - benchmark-run 做分维度分数追踪（适合 post-merge 趋势监控）
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RUNTIME_DIR = resolve(ROOT, ".runtime-data", "benchmarks");
const SUITE_PATH = resolve(ROOT, "benchmarks", "suite.json");

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

const ARGS = new Set(process.argv.slice(2));

/** @param {string} name */
function getArg(name) {
  const prefix = `${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) {
      const idx = process.argv.indexOf(arg);
      return process.argv[idx + 1] ?? "true";
    }
  }
  return null;
}

const SELECTED_TRACK = getArg("--track");
const BASELINE_PATH = getArg("--baseline");
const CI_MODE = ARGS.has("--ci");
const JSON_ONLY = ARGS.has("--json-only");

/** @param {string} msg */
function log(msg) {
  if (!JSON_ONLY) console.log(msg);
}

/** @param {string} cmd */
function sh(cmd, timeoutMs = 30_000) {
  try {
    return { ok: true, output: execSync(cmd, { cwd: ROOT, encoding: "utf8", timeout: timeoutMs, stdio: "pipe" }) };
  } catch (e) {
    return { ok: false, output: e.stdout ?? e.stderr ?? String(e) };
  }
}

// === 加载 Suite ===

function loadSuite() {
  const raw = readFileSync(SUITE_PATH, "utf8");
  return JSON.parse(raw);
}

// === 各 Track 的执行方式 ===

/** 跑叙事质量 (mock chat eval, 需要 dev server 运行) */
function runNarrativeQuality() {
  log(`${colors.cyan}⏳ 叙事质量基准测试 (44 cases)...${colors.reset}`);

  // 先检查 dev server 是否可达
  const healthCheck = sh("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:666/api/chat 2>/dev/null || echo '000'", 5_000);
  const serverUp = healthCheck.output?.trim() === "200" || healthCheck.output?.trim() === "405"; // 405 = method not allowed but server is up

  if (!serverUp) {
    log(`  ${colors.yellow}⚠  Dev server 未运行，改用离线评估${colors.reset}`);
    // 离线评估：跑 judge 框架测试作为替代
    const judgeResult = sh("npx tsx --test src/lib/evals/judge/judge.test.ts", 30_000);
    const judgePass = extractPassRate(judgeResult.output);
    // 也跑 narrativeSafety rubric 测试
    const safetyResult = sh("npx tsx --test src/lib/evals/narrativeSafetyRubric.test.ts", 30_000);
    const safetyPass = extractPassRate(safetyResult.output);

    const combinedTotal = (judgePass.total || 0) + (safetyPass.total || 0);
    const combinedPass = (judgePass.pass || 0) + (safetyPass.pass || 0);
    const score = combinedTotal > 0 ? combinedPass / combinedTotal : 0;

    return {
      ok: true,
      mode: "offline",
      score,
      detail: { judge: judgePass, safety: safetyPass, combinedRate: score },
    };
  }

  // 服务器在线，跑完整 mock 评测
  const result = sh("npx tsx scripts/eval-chat-quality.ts --mode mock --json-only", 120_000);
  if (!result.ok) {
    // HTTP eval 失败，降级到离线
    log(`  ${colors.yellow}⚠  HTTP eval 失败，降级到离线评估${colors.reset}`);
    const judgeResult = sh("npx tsx --test src/lib/evals/judge/judge.test.ts", 30_000);
    const judgePass = extractPassRate(judgeResult.output);
    return {
      ok: true,
      mode: "fallback",
      score: judgePass.passRate,
      detail: { note: "HTTP eval failed, using offline fallback", judge: judgePass },
    };
  }
  try {
    const data = JSON.parse(result.output);
    return {
      ok: true,
      mode: "live-mock",
      score: data.summary?.overallScore ?? 0,
      detail: data.summary ?? {},
      raw: data,
    };
  } catch {
    return { ok: false, error: "JSON parse failed", score: 0, detail: {} };
  }
}

/** 跑 Task-based 游戏机制评测 (offline) */
function runGameMechanics() {
  log(`${colors.cyan}⏳ 游戏机制基准测试 (9 scenarios)...${colors.reset}`);
  const result = sh("npx tsx --test src/lib/evals/taskEval/taskEval.test.ts", 30_000);

  // 从测试输出中提取分数
  const summary = extractPassRate(result.output);
  return {
    ok: result.ok,
    score: summary.passRate,
    detail: summary,
    raw: result.output,
  };
}

/** 跑红队安全扫描 */
function runSafetyCompliance() {
  log(`${colors.cyan}⏳ 安全合规基准测试 (18 attacks + 28 safety cases)...${colors.reset}`);

  // 先跑红队
  const redTeam = sh("npx tsx --test src/lib/evals/redTeam/redTeam.test.ts", 30_000);
  const redPass = extractPassRate(redTeam.output);

  // 再跑 narrative safety（如果网络可达）
  let safetyPass = { passRate: 0, total: 0, pass: 0 };
  const safetyResult = sh("npx tsx --test src/lib/evals/narrativeSafetyRubric.test.ts", 30_000);
  if (safetyResult.ok) {
    safetyPass = extractPassRate(safetyResult.output);
  } else {
    log(`  ${colors.yellow}⚠  narrative safety 测试不可用，不计入 pass${colors.reset}`);
  }

  const combinedTotal = (redPass.total || 0) + (safetyPass.total || 0);
  const combinedPass = (redPass.pass || 0) + (safetyPass.pass || 0);
  const combinedRate = combinedTotal > 0 ? combinedPass / combinedTotal : 0;

  return {
    ok: redTeam.ok && safetyResult.ok,
    score: combinedRate,
    detail: { redTeam: redPass, safety: safetyPass, combinedRate },
  };
}

/** 从 tsx --test 输出中提取通过率 */
function extractPassRate(output) {
  const totalMatch = output.match(/tests (\d+)/);
  const passMatch = output.match(/pass (\d+)/);
  const failMatch = output.match(/fail (\d+)/);
  const total = totalMatch ? Number(totalMatch[1]) : 0;
  const pass = passMatch ? Number(passMatch[1]) : 0;
  const fail = failMatch ? Number(failMatch[1]) : 0;
  return {
    total,
    pass,
    fail,
    passRate: total > 0 ? pass / total : 0,
  };
}

// === 主流程 ===

function main() {
  const suite = loadSuite();
  const startTime = Date.now();

  log("");
  log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  log(`${colors.bold}${colors.cyan}  VerseCraft 基准测试跑分器${colors.reset}`);
  log(`${colors.bold}${colors.cyan}  ${suite.name} v${suite.version}${colors.reset}`);
  log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  log(`Tracks: ${suite.tracks.length} | 总分阈值: ${suite.scoring.overallPassThreshold}`);
  log("");

  const results = {};
  let overallScore = 0;
  let totalWeight = 0;
  let allPassed = true;

  for (const track of suite.tracks) {
    if (SELECTED_TRACK && track.id !== SELECTED_TRACK) {
      log(`${colors.dim}⏭️ SKIP  ${track.name} (--track=${SELECTED_TRACK})${colors.reset}`);
      continue;
    }

    let result;
    switch (track.id) {
      case "narrative_quality":
        result = runNarrativeQuality();
        break;
      case "game_mechanics":
        result = runGameMechanics();
        break;
      case "safety_compliance":
        result = runSafetyCompliance();
        break;
      default:
        result = { ok: false, error: `Unknown track: ${track.id}`, score: 0, detail: {} };
    }

    const trackScore = result.ok && typeof result.score === "number" ? result.score : 0;
    const trackPassed = trackScore >= (track.passThreshold ?? 0.85);
    if (!trackPassed) allPassed = false;

    const icon = trackPassed ? `${colors.green}✅${colors.reset}` : `${colors.red}❌${colors.reset}`;
    log(`  ${icon} ${track.name}: ${(trackScore * 100).toFixed(1)}% (阈值 ${(track.passThreshold ?? 0.85) * 100}%)`);

    results[track.id] = {
      name: track.name,
      weight: track.weight,
      score: trackScore,
      passed: trackPassed,
      threshold: track.passThreshold,
      detail: result.detail,
    };

    overallScore += trackScore * track.weight;
    totalWeight += track.weight;
  }

  // 归一化总分
  if (totalWeight > 0) overallScore /= totalWeight;

  const durationMs = Date.now() - startTime;

  // 对比基线（如果有）
  let baselineDelta = null;
  if (BASELINE_PATH) {
    const baselinePath = resolve(BASELINE_PATH);
    if (existsSync(baselinePath)) {
      try {
        const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
        baselineDelta = {
          previousScore: baseline.overallScore ?? 0,
          currentScore: overallScore,
          delta: overallScore - (baseline.overallScore ?? 0),
          trackDeltas: {},
        };
        for (const [trackId, trackResult] of Object.entries(results)) {
          const prev = baseline.tracks?.[trackId]?.score ?? 0;
          baselineDelta.trackDeltas[trackId] = {
            previous: prev,
            current: trackResult.score,
            delta: trackResult.score - prev,
          };
        }
      } catch {
        log(`${colors.yellow}⚠ 基线文件解析失败，跳过对比${colors.reset}`);
      }
    }
  }

  // 输出结果
  log("");
  log(`${colors.bold}${colors.cyan}───────────────────────────────────────${colors.reset}`);
  log(`${colors.bold}结果${colors.reset}  (${(durationMs / 1000).toFixed(1)}s)`);
  log("");

  log(`${colors.bold}综合得分: ${(overallScore * 100).toFixed(1)}%${colors.reset}`);
  log(`门禁: ${allPassed ? `${colors.green}通过 ✅${colors.reset}` : `${colors.red}未通过 ❌${colors.reset}`}`);

  if (baselineDelta) {
    const deltaIcon = baselineDelta.delta >= 0 ? `${colors.green}↑${colors.reset}` : `${colors.red}↓${colors.reset}`;
    log(`基线对比: ${(baselineDelta.previousScore * 100).toFixed(1)}% → ${(baselineDelta.currentScore * 100).toFixed(1)}%  ${deltaIcon} ${(baselineDelta.delta * 100).toFixed(1)}%`);

    log("");
    log(`${colors.bold}分 Track 对比:${colors.reset}`);
    for (const [trackId, delta] of Object.entries(baselineDelta.trackDeltas)) {
      const d = delta;
      const dIcon = d.delta >= 0 ? `${colors.green}↑${colors.reset}` : `${colors.red}↓${colors.reset}`;
      log(`  ${trackId}: ${(d.previous * 100).toFixed(1)}% → ${(d.current * 100).toFixed(1)}%  ${dIcon} ${(d.delta * 100 >= 0 ? "+" : "")}${(d.delta * 100).toFixed(1)}%`);
    }
  }

  // 保存结果
  mkdirSync(RUNTIME_DIR, { recursive: true });
  const resultPayload = {
    suite: suite.name,
    version: suite.version,
    timestamp: new Date().toISOString(),
    overallScore,
    passed: allPassed,
    tracks: results,
    baselineDelta,
    durationMs,
  };

  const resultPath = join(RUNTIME_DIR, `benchmark-${Date.now()}.json`);
  writeFileSync(resultPath, JSON.stringify(resultPayload, null, 2) + "\n", "utf8");
  // 也存一份 latest
  const latestPath = join(RUNTIME_DIR, "benchmark-latest.json");
  writeFileSync(latestPath, JSON.stringify(resultPayload, null, 2) + "\n", "utf8");

  log("");
  log(`${colors.dim}结果已保存: ${resultPath}${colors.reset}`);
  log(`${colors.dim}最新结果: ${latestPath}${colors.reset}`);

  if (JSON_ONLY) {
    console.log(JSON.stringify(resultPayload, null, 2));
  }

  // CI 模式下，未通过返回非零退出码
  if (CI_MODE && !allPassed) {
    process.exit(1);
  }

  process.exit(0);
}

main();
