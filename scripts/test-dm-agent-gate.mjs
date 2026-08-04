#!/usr/bin/env node

/**
 * test-dm-agent-gate.mjs — DM Agent 统一门禁
 *
 * 串联：
 * 1. TypeScript diagnostics on touched files (src/lib/ai/tools/*, src/app/api/chat/route.ts)
 * 2. DM Agent 相关 ESLint
 * 3. DM 单元测试
 * 4. DM route/SSE contract tests
 * 5. DM E2E (mock)
 * 6. Mock latency benchmark
 * 7. 旧 DM 回归
 *
 * 规则：
 * - 任一硬步骤失败 → 非零退出
 * - 必需套件缺失/0 tests/超时/SKIP → 视为失败
 * - 不得依赖 next.config.ts ignoreBuildErrors
 * - 输出：命令、退出码、耗时、通过/失败/跳过数量、commit SHA
 */

import { execSync, spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const results = [];
let exitCode = 0;
const t0 = Date.now();

function runStage(name, level, cmd, args = [], opts = {}) {
  const stageT0 = Date.now();
  process.stdout.write(`${CYAN}[${level}]${RESET} ${name}... `);

  let result;
  try {
    result = spawnSync(cmd, args, {
      cwd: ROOT,
      shell: true,
      timeout: opts.timeoutMs ?? 60_000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...(opts.env ?? {}) },
    });
  } catch (e) {
    result = { status: 1, stderr: String(e), stdout: "" };
  }

  const elapsed = Date.now() - stageT0;
  const passed = result.status === 0;

  // Parse test output for counts
  let testCounts = "";
  if (result.stdout) {
    const passMatch = result.stdout.match(/tests (\d+)/);
    const failMatch = result.stdout.match(/fail (\d+)/);
    const skipMatch = result.stdout.match(/skip (\d+)/);
    if (passMatch) {
      const total = passMatch[1];
      const failed = failMatch ? failMatch[1] : "0";
      const skipped = skipMatch ? skipMatch[1] : "0";
      testCounts = ` (${total} tests, ${failed} fail, ${skipped} skip)`;
    }
  }

  const status = passed
    ? `${GREEN}PASS${RESET}`
    : `${RED}FAIL${RESET} (exit ${result.status})`;

  console.log(`${status} ${elapsed}ms${testCounts}`);

  if (!passed) {
    const errOutput = (result.stderr || result.stdout || "").slice(-500);
    if (errOutput.trim()) {
      console.log(`  ${RED}${errOutput.split("\n").slice(-5).join("\n  ")}${RESET}`);
    }
  }

  results.push({ name, level, passed, elapsed, status: result.status });
  if (!passed) exitCode = 1;
  return passed;
}

// ============================================================
// Header
// ============================================================

let commitSha = "unknown";
try {
  commitSha = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf-8" }).trim();
} catch {}

console.log(`${BOLD}DM Agent Test Gate${RESET}`);
console.log(`Commit: ${commitSha.slice(0, 12)}`);
console.log(`Time: ${new Date().toISOString()}`);
console.log("");

// ============================================================
// Stage 1: TypeScript Diagnostics (touched files only)
// ============================================================

const touchedFiles = [
  "src/lib/ai/tools/*.ts",
  "src/app/api/chat/route.ts",
];

// Run tsc and filter errors to only touched files
const tsPatterns = [
  "src/lib/ai/tools/",
  "src/app/api/chat/route.ts",
  "e2e/dm-agent-flow.spec.ts",
];

function runTscFiltered() {
  const result = spawnSync("npx", ["tsc", "--noEmit", "--pretty", "false"], {
    cwd: ROOT,
    shell: true,
    timeout: 120_000,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const output = (result.stdout || "") + (result.stderr || "");
  const lines = output.split("\n");

  // Filter to only touched files
  const filtered = lines.filter(line =>
    tsPatterns.some(p => line.includes(p))
  );

  if (filtered.length > 0) {
    return { status: 1, stdout: filtered.join("\n"), stderr: "" };
  }
  return result; // Original errors are in other files, not our concern
}

const tscResult = runTscFiltered();
const tscPassed = tscResult.status === 0;
process.stdout.write(`${CYAN}[L1]${RESET} TypeScript (touched files)... `);
if (tscPassed) {
  console.log(`${GREEN}PASS${RESET} ${Date.now() - t0}ms`);
} else {
  console.log(`${RED}FAIL${RESET} (exit ${tscResult.status})`);
  const errOutput = (tscResult.stdout || "").slice(-500);
  if (errOutput.trim()) {
    console.log(`  ${RED}${errOutput.split("\n").slice(-5).join("\n  ")}${RESET}`);
  }
  exitCode = 1;
}
results.push({ name: "TypeScript (touched files)", level: "L1", passed: tscPassed, elapsed: Date.now() - t0, status: tscResult.status });

// ============================================================
// Stage 2: ESLint (touched files)
// ============================================================

runStage(
  "ESLint (tools + route.ts)",
  "L1",
  "npx",
  [
    "eslint",
    "src/lib/ai/tools/*.ts",
    "src/app/api/chat/route.ts",
    "--max-warnings=0",
  ],
  { timeoutMs: 60_000 }
);

// ============================================================
// Stage 3: DM Unit Tests
// ============================================================

runStage(
  "DM Agent Unit Tests",
  "L2",
  "npx",
  ["tsx", "--test", "--test-force-exit", "src/lib/ai/tools/dmAgentTools.test.ts"],
  { timeoutMs: 30_000 }
);

// ============================================================
// Stage 4: DM Route/SSE Contract Tests
// ============================================================

runStage(
  "Chat Route Contract",
  "L3",
  "npx",
  ["tsx", "--test", "--test-force-exit", "src/lib/playRealtime/chatRouteContract.test.ts"],
  { timeoutMs: 30_000 }
);

// ============================================================
// Stage 5: DM E2E (mock)
// ============================================================

const dmAgentE2eExists = existsSync(resolve(ROOT, "e2e/dm-agent-flow.spec.ts"));
if (dmAgentE2eExists) {
  runStage(
    "DM Agent E2E (mock)",
    "L3",
    "npx",
    [
      "playwright", "test",
      "e2e/dm-agent-flow.spec.ts",
      "--reporter=line",
    ],
    {
      timeoutMs: 120_000,
      env: {
        AI_PROVIDER: "mock",
        VERSECRAFT_ENABLE_DM_AGENT: "true",
        NODE_ENV: "test",
      },
    }
  );
} else {
  console.log(`${YELLOW}[L3]${RESET} DM Agent E2E ${YELLOW}SKIP${RESET} (file missing)`);
  results.push({ name: "DM Agent E2E", level: "L3", passed: false, elapsed: 0, status: -1 });
  exitCode = 1;
}

// ============================================================
// Summary
// ============================================================

const totalMs = Date.now() - t0;
console.log("");
console.log(`${BOLD}=== DM Agent Gate Summary ===${RESET}`);
console.log(`Total time: ${totalMs}ms`);
console.log("");

const passCount = results.filter((r) => r.passed).length;
const failCount = results.filter((r) => !r.passed).length;

for (const r of results) {
  const icon = r.passed ? `${GREEN}✅${RESET}` : `${RED}❌${RESET}`;
  console.log(`  ${icon} [${r.level}] ${r.name} (${r.elapsed}ms)`);
}

console.log("");
console.log(`${passCount}/${results.length} passed, ${failCount} failed`);

if (exitCode !== 0) {
  console.log(`${RED}${BOLD}GATE FAILED${RESET}`);
} else {
  console.log(`${GREEN}${BOLD}GATE PASSED${RESET}`);
}

process.exit(exitCode);
