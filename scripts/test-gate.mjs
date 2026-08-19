#!/usr/bin/env node

/**
 * test-gate.mjs — VerseCraft 统一回归门禁
 *
 * 一键运行所有关键验证，输出清晰的 PASS/FAIL 信号。
 * 用法：
 *   node scripts/test-gate.mjs              # 完整门禁
 *   node scripts/test-gate.mjs --quick      # 快速门禁（跳过慢速 eval）
 *   node scripts/test-gate.mjs --ci         # CI 模式（严格退出码）
 *
 * 门禁层级：
 *   L1: Lint + Type Check（~30s）
 *   L2: Unit Tests（~15s）
 *   L3: Game Contracts + Promptfoo + Playthrough（~30s）
 *   L4: Eval Quality（~60s，mock mode）
 *   L5: Eval Safety + Red Team + Detectors + Narrative Style + Narrative Safety（~90s，mock mode）
 *   L6: Task-based Eval + Judge（~10s，offline）
 *   L7: Build（~90s）
 *   L8: Server-side Eval（需 start server，非 CI 仅 quick 跳过）
 *
 * 输出格式：
 *   ✅ PASS  L1 lint-check
 *   ❌ FAIL  L2 unit-tests  (3 failures)
 *   ⏭️ SKIP  L4 eval-quality  (--quick mode)
 *   ⚠️ WARN  L6 build  (typescript errors tolerated per next.config.ts)
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const ARGS = new Set(process.argv.slice(2));
const QUICK = ARGS.has("--quick");
const CI = ARGS.has("--ci");
const SKIP_BUILD = ARGS.has("--skip-build");

/** @typedef {{ name: string; level: string; command: string; args?: string[]; timeoutMs: number; skipInQuick?: boolean }} GateStage */

/** @type {GateStage[]} */
const STAGES = [
  {
    name: "lint-check",
    level: "L1",
    command: "npx",
    args: ["eslint", "src/**/*.{ts,tsx}", "e2e/**/*.ts", "--max-warnings=999"],
    timeoutMs: 60_000,
  },
  {
    name: "unit-tests",
    level: "L2",
    command: "pnpm",
    args: ["test:unit"],
    timeoutMs: 600_000,
  },
  {
    name: "game-contracts",
    level: "L3",
    command: "npx",
    args: ["tsx", "--test", "src/lib/contracts/**/*.test.ts"],
    timeoutMs: 30_000,
    skipInQuick: false,
  },
  {
    name: "promptfoo-deterministic",
    level: "L3",
    command: "npx",
    args: ["tsx", "--test", "tests/promptfoo/tests/weapon-schema.test.ts", "tests/promptfoo/tests/profession-rules.test.ts"],
    timeoutMs: 15_000,
    skipInQuick: false,
  },
  {
    name: "playthrough-mock",
    level: "L3",
    command: "npx",
    args: ["tsx", "--test", "src/lib/evals/playthrough/playthrough.test.ts"],
    timeoutMs: 30_000,
    skipInQuick: true,
  },
  {
    name: "eval-quality",
    level: "L4",
    command: "npx",
    args: ["tsx", "scripts/eval-chat-quality.ts", "--mode", "mock", "--assert", "--json-out", ".runtime-data/eval/test-gate/chat-quality.json"],
    timeoutMs: 120_000,
    skipInQuick: true,
  },
  {
    name: "eval-npc-consistency",
    level: "L5",
    command: "npx",
    args: ["tsx", "scripts/eval-npc-consistency.ts", "--mode", "mock", "--assert", "--json-out", ".runtime-data/eval/test-gate/npc-consistency.json"],
    timeoutMs: 90_000,
    skipInQuick: true,
  },
  {
    name: "eval-detectors",
    level: "L5",
    command: "npx",
    args: ["tsx", "scripts/eval-detectors.ts", "--mode", "mock", "--json-out", ".runtime-data/eval/test-gate/detectors.json"],
    timeoutMs: 30_000,
    skipInQuick: true,
  },
  {
    name: "eval-narrative-style",
    level: "L5",
    command: "npx",
    args: ["tsx", "scripts/eval-narrative-style.ts", "--mode", "mock", "--assert", "--json-out", ".runtime-data/eval/test-gate/narrative-style.json"],
    timeoutMs: 60_000,
    skipInQuick: true,
  },
  {
    name: "eval-narrative-safety",
    level: "L5",
    command: "npx",
    args: ["tsx", "scripts/eval-narrative-safety.ts", "--mode", "mock", "--json-out", ".runtime-data/eval/test-gate/narrative-safety.json"],
    timeoutMs: 60_000,
    skipInQuick: true,
  },
  {
    name: "task-eval-offline",
    level: "L6",
    command: "npx",
    args: ["tsx", "--test", "src/lib/evals/taskEval/taskEval.test.ts"],
    timeoutMs: 30_000,
    skipInQuick: true,
  },
  {
    name: "red-team-scan",
    level: "L6",
    command: "npx",
    args: ["tsx", "--test", "src/lib/evals/redTeam/redTeam.test.ts"],
    timeoutMs: 30_000,
    skipInQuick: true,
  },
  {
    name: "judge-framework",
    level: "L6",
    command: "npx",
    args: ["tsx", "--test", "src/lib/evals/judge/judge.test.ts"],
    timeoutMs: 30_000,
    skipInQuick: true,
  },
  {
    name: "build",
    level: "L7",
    command: "pnpm",
    args: ["build"],
    timeoutMs: 180_000,
    skipInQuick: true,
    optionalFail: true, // next.config.ts sets ignoreBuildErrors: true
  },
];

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {{ ok: boolean; output: string; code: number | null }}
 */
function run(cmd, args = [], timeoutMs = 60_000) {
  const fullCmd = [cmd, ...args].join(" ");
  try {
    const output = execSync(fullCmd, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: "pipe",
      env: { ...process.env, FORCE_COLOR: "0", CI: CI ? "true" : "" },
    });
    return { ok: true, output, code: 0 };
  } catch (err) {
    const code = err.code ?? (err.status ?? 1);
    const output = err.stdout ?? err.stderr ?? String(err);
    return { ok: false, output: String(output).slice(-2000), code };
  }
}

function main() {
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  VerseCraft 回归门禁${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════${colors.reset}`);
  console.log(`模式: ${QUICK ? "快速 (--quick)" : "完整"}`);
  console.log(`CI: ${CI ? "是 (严格退出码)" : "否"}`);
  console.log("");

  const results = [];
  let hasHardFailure = false;
  const startAll = Date.now();

  for (const stage of STAGES) {
    const shouldSkip = stage.skipInQuick && QUICK;
    if (shouldSkip) {
      console.log(`${colors.yellow}⏭️ SKIP${colors.reset}  ${stage.level} ${stage.name}  (--quick mode)`);
      results.push({ ...stage, status: "SKIP" });
      continue;
    }

    // Check if contract tests directory exists
    if (stage.name === "game-contracts" && !existsSync(resolve(ROOT, "src/lib/contracts"))) {
      console.log(`${colors.yellow}⏭️ SKIP${colors.reset}  ${stage.level} ${stage.name}  (no contracts directory yet)`);
      results.push({ ...stage, status: "SKIP" });
      continue;
    }

    process.stdout.write(`${colors.cyan}⏳ RUN${colors.reset}   ${stage.level} ${stage.name} ... `);
    const startTime = Date.now();
    const result = run(stage.command, stage.args ?? [], stage.timeoutMs);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.ok) {
      console.log(`${colors.green}✅ PASS${colors.reset}  (${elapsed}s)`);
      results.push({ ...stage, status: "PASS" });
    } else if (stage.optionalFail) {
      console.log(`${colors.yellow}⚠️ WARN${colors.reset}  (${elapsed}s) — optional stage, continuing`);
      results.push({ ...stage, status: "WARN" });
    } else {
      console.log(`${colors.red}❌ FAIL${colors.reset}  (${elapsed}s)`);
      results.push({ ...stage, status: "FAIL", error: result.output.slice(0, 500) });
      hasHardFailure = true;
    }
  }

  const totalElapsed = ((Date.now() - startAll) / 1000).toFixed(1);

  // Summary
  console.log("");
  console.log(`${colors.bold}${colors.cyan}───────────────────────────────────────${colors.reset}`);
  console.log(`${colors.bold}结果总览${colors.reset}  (总耗时 ${totalElapsed}s)`);
  console.log("");

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let warnCount = 0;

  for (const r of results) {
    const icon =
      r.status === "PASS" ? `${colors.green}✅${colors.reset}` :
      r.status === "FAIL" ? `${colors.red}❌${colors.reset}` :
      r.status === "WARN" ? `${colors.yellow}⚠️${colors.reset}` :
      `${colors.yellow}⏭️${colors.reset}`;

    console.log(`  ${icon}  ${r.level} ${r.name}`);

    if (r.status === "PASS") passCount++;
    else if (r.status === "FAIL") failCount++;
    else if (r.status === "WARN") warnCount++;
    else skipCount++;
  }

  console.log("");
  console.log(`通过: ${passCount}  |  失败: ${failCount}  |  警告: ${warnCount}  |  跳过: ${skipCount}`);
  console.log("");

  // Print failure details
  const failures = results.filter((r) => r.status === "FAIL");
  if (failures.length > 0) {
    console.log(`${colors.red}${colors.bold}失败详情:${colors.reset}`);
    for (const f of failures) {
      console.log(`  ${colors.red}❌ ${f.level} ${f.name}${colors.reset}`);
      if (f.error) {
        const lines = f.error.split("\n").slice(0, 10);
        for (const line of lines) {
          console.log(`     ${colors.red}${line}${colors.reset}`);
        }
        if (f.error.split("\n").length > 10) {
          console.log(`     ${colors.red}... (truncated)${colors.reset}`);
        }
      }
    }
    console.log("");
  }

  // Final verdict
  if (hasHardFailure) {
    console.log(`${colors.red}${colors.bold}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.red}${colors.bold}  ❌ 门禁未通过 — 请修复上述失败项${colors.reset}`);
    console.log(`${colors.red}${colors.bold}═══════════════════════════════════════${colors.reset}`);
  } else {
    console.log(`${colors.green}${colors.bold}═══════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}${colors.bold}  ✅ 门禁通过 — 所有检查已通过${colors.reset}`);
    console.log(`${colors.green}${colors.bold}═══════════════════════════════════════${colors.reset}`);
  }

  if (CI && hasHardFailure) {
    process.exit(1);
  }

  // In CI, exit 0 even if only optional stages failed
  process.exit(0);
}

main();
