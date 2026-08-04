#!/usr/bin/env node

/**
 * test-runner.mjs — VerseCraft 统一测试执行器
 *
 * 根据风险级别或 git diff 自动选择并运行对应测试套件。
 *
 * 用法：
 *   node scripts/test-runner.mjs --risk L2
 *   node scripts/test-runner.mjs --diff "src/lib/turnEngine/a.ts"
 *   node scripts/test-runner.mjs --risk L2 --mode quick
 *   node scripts/test-runner.mjs --risk L3 --mode full --json-out .runtime-data/result.json
 *
 * 模式：
 *   quick  — focused + adversarial (默认)
 *   full   — focused + adversarial + app + regression
 *   ci     — 完整门禁，严格退出码
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── 参数解析 ──────────────────────────────────────────────

const ARGS = process.argv.slice(2);
const FLAGS = {
  risk: ARGS.includes("--risk") ? ARGS[ARGS.indexOf("--risk") + 1] : undefined,
  diff: ARGS.includes("--diff") ? ARGS[ARGS.indexOf("--diff") + 1] : undefined,
  mode: ARGS.includes("--mode") ? ARGS[ARGS.indexOf("--mode") + 1] : "quick",
  jsonOut: ARGS.includes("--json-out") ? ARGS[ARGS.indexOf("--json-out") + 1] : undefined,
  help: ARGS.includes("--help") || ARGS.includes("-h"),
};

if (FLAGS.help) {
  console.log(`
VerseCraft 统一测试执行器

用法:
  node scripts/test-runner.mjs [选项]

选项:
  --risk <L0|L1|L2|L3|L4>   风险级别（必需，除非提供 --diff）
  --diff "<files>"           空格分隔的文件列表，自动推断风险
  --mode <quick|full|ci>     测试模式（默认: quick）
  --json-out <path>          输出 JSON 报告到文件
  --help, -h                 显示帮助

模式:
  quick  focused + adversarial（本地迭代反馈 <2min）
  full   focused + adversarial + app + regression（完整验证）
  ci     与 full 相同，但严格退出码 + JSON 报告
`);
  process.exit(0);
}

// ── 风险推断 ──────────────────────────────────────────────

/**
 * 简化的风险推断（纯 JS 实现，不依赖 TypeScript）。
 * 与 src/lib/ai/agentContext.ts 中的 inferRiskLevel 保持逻辑一致。
 */
function inferRiskFromFiles(files) {
  if (!files || files.length === 0) return "L1";
  let maxLevel = 0;
  let matchedL0 = false;

  for (const file of files) {
    let level = 0;

    // L4
    if (
      file.includes("src/lib/security/") ||
      file.includes("src/lib/epistemic/") ||
      file.includes("src/lib/npcConsistency/") ||
      file.includes("src/lib/narrativeGovernance/") ||
      file.includes("src/lib/narrativeEngine/") ||
      file.includes("src/lib/worldEngine/") ||
      file.includes("src/lib/endings/") ||
      file.includes("src/lib/evals/judge/")
    ) level = 4;

    // L3
    if (
      file.includes("src/app/api/chat/") ||
      file.includes("src/lib/playRealtime/") ||
      file.includes("src/lib/turnEngine/") ||
      file.includes("src/db/") ||
      file.includes("src/lib/ai/") ||
      file.includes("src/lib/analytics/") ||
      file.includes("src/lib/state/")
    ) level = Math.max(level, 3);

    // L2
    if (
      file.includes("src/store/") ||
      file.includes("src/components/") ||
      file.includes("src/features/") ||
      file.includes("src/app/") ||
      file.includes("e2e/") ||
      file.includes("src/middleware") ||
      file.includes("src/lib/combat/") ||
      file.includes("src/lib/chapters/")
    ) level = Math.max(level, 2);

    // L1
    if (file.startsWith("src/") && (file.endsWith(".ts") || file.endsWith(".tsx"))) {
      level = Math.max(level, 1);
    }

    // L0
    if (file.startsWith("docs/") || file.startsWith("README") || file.endsWith(".md")) {
      matchedL0 = true;
    }

    maxLevel = Math.max(maxLevel, level);
  }

  if (maxLevel === 0 && matchedL0) return "L0";
  if (maxLevel === 0) return "L1";
  const map = { 0: "L0", 1: "L1", 2: "L2", 3: "L3", 4: "L4" };
  return map[maxLevel] || "L1";
}

// ── 测试套件定义 ──────────────────────────────────────────

const TEST_SUITES = {
  L0: { focused: [], adversarial: [], app: [], regression: [] },
  L1: {
    focused: ["npx eslint --max-warnings=999 src/lib/ai/*.ts src/lib/testing/*.ts"],
    adversarial: ["npx tsx --test src/lib/ai/*.test.ts src/lib/testing/*.test.ts"],
    app: [],
    regression: [],
  },
  L2: {
    focused: ["npx eslint --max-warnings=999 src/**/*.{ts,tsx}"],
    adversarial: ["npx tsx --test src/**/*.test.ts"],
    app: ["npx playwright test play.spec.ts --reporter=line"],
    regression: [
      "npx playwright test play.spec.ts mobile-reading-ui.spec.ts --reporter=line",
    ],
  },
  L3: {
    focused: ["npx eslint --max-warnings=999 src/**/*.{ts,tsx}"],
    adversarial: [
      "npx tsx --test src/lib/playRealtime/chatRouteContract.test.ts",
      "npx tsx --test src/lib/turnEngine/*.test.ts",
    ],
    app: ["npx playwright test chat-sse-contract.spec.ts --reporter=line"],
    regression: [
      "npx tsx --test src/**/*.test.ts",
      "npx playwright test chat-sse-contract.spec.ts play.spec.ts --reporter=line",
    ],
  },
  L4: {
    focused: ["npx eslint --max-warnings=999 src/**/*.{ts,tsx}"],
    adversarial: [
      "npx tsx --test src/**/*.test.ts",
      "npx tsx --test tests/promptfoo/tests/*.test.ts",
    ],
    app: [
      "npx playwright test chat-sse-contract.spec.ts play.spec.ts --reporter=line",
    ],
    regression: [
      "npx tsx --test src/**/*.test.ts",
      "pnpm eval:narrative-safety:mock",
      "pnpm eval:npc-consistency:mock",
    ],
  },
};

// ── 执行引擎 ──────────────────────────────────────────────

/**
 * 执行单个命令，返回结果。
 */
function runCommand(cmd, timeoutMs = 120_000) {
  const start = Date.now();
  try {
    const output = execSync(cmd, {
      cwd: ROOT,
      timeout: timeoutMs,
      encoding: "utf-8",
      stdio: "pipe",
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    return {
      cmd,
      exitCode: 0,
      output: output.slice(-2000),
      durationMs: Date.now() - start,
      passed: true,
    };
  } catch (err) {
    return {
      cmd,
      exitCode: err.status || 1,
      output: (err.stdout || "") + (err.stderr || "").slice(-2000),
      durationMs: Date.now() - start,
      passed: false,
    };
  }
}

/**
 * 运行一组命令，并行或串行。
 */
function runSuite(commands, parallel = false) {
  if (commands.length === 0) return [];
  if (parallel) {
    // 简化：串行执行（Node 单线程无实际并行优势）
  }
  return commands.map((cmd) => runCommand(cmd));
}

// ── 主流程 ────────────────────────────────────────────────

function main() {
  const risk = FLAGS.risk || inferRiskFromFiles(
    FLAGS.diff ? FLAGS.diff.split(/\s+/) : []
  );
  const mode = FLAGS.mode || "quick";

  if (!["L0", "L1", "L2", "L3", "L4"].includes(risk)) {
    console.error(`❌ 无效的风险级别: ${risk} (应为 L0-L4)`);
    process.exit(2);
  }

  const suite = TEST_SUITES[risk];
  if (!suite) {
    console.error(`❌ 未找到风险级别 ${risk} 的测试套件`);
    process.exit(2);
  }

  console.log(`🔬 VerseCraft 测试执行器`);
  console.log(`   风险级别: ${risk}`);
  console.log(`   模式: ${mode}`);
  console.log("");

  const results = [];
  const stages = mode === "quick"
    ? ["focused", "adversarial"]
    : ["focused", "adversarial", "app", "regression"];

  let allPassed = true;

  for (const stage of stages) {
    const commands = suite[stage] || [];
    if (commands.length === 0) {
      console.log(`⏭️  ${stage}: 无测试用例`);
      continue;
    }

    console.log(`⏳ ${stage} (${commands.length} 项)...`);
    const stageResults = runSuite(commands);

    for (const r of stageResults) {
      const icon = r.passed ? "✅" : "❌";
      const truncated = r.cmd.length > 80 ? r.cmd.slice(0, 77) + "..." : r.cmd;
      console.log(`  ${icon} ${truncated} (${r.durationMs}ms, exit=${r.exitCode})`);
      if (!r.passed) allPassed = false;
    }

    results.push({ stage, results: stageResults });
    console.log("");
  }

  // ── 汇总 ──────────────────────────────────────────────

  const totalCommands = results.reduce((sum, s) => sum + s.results.length, 0);
  const passedCommands = results.reduce(
    (sum, s) => sum + s.results.filter((r) => r.passed).length,
    0,
  );

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  const verdict = allPassed ? "✅ 全部通过" : "❌ 存在失败";
  console.log(`${verdict} — ${passedCommands}/${totalCommands} 通过`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // ── JSON 输出 ──────────────────────────────────────────

  const report = {
    timestamp: new Date().toISOString(),
    risk,
    mode,
    stages: results.map((s) => ({
      stage: s.stage,
      passed: s.results.every((r) => r.passed),
      commands: s.results.map((r) => ({
        cmd: r.cmd,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        passed: r.passed,
      })),
    })),
    verdict: allPassed ? "pass" : "fail",
  };

  if (FLAGS.jsonOut) {
    const outPath = resolve(ROOT, FLAGS.jsonOut);
    const outDir = dirname(outPath);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 报告已写入: ${outPath}`);
  }

  process.exit(allPassed ? 0 : 1);
}

main();
