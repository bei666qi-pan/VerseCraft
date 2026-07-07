#!/usr/bin/env tsx
/**
 * DeepEval 运行器（Node → Python wrapper）
 *
 * 调用 tests/deepeval/ 下的 pytest 测试，并把结果转换为
 * 与 Node 侧 harness 兼容的 JSON 报告。
 *
 * 用法：
 *   pnpm dlx tsx scripts/run-deepeval.ts                    # 默认 mock 模式
 *   pnpm dlx tsx scripts/run-deepeval.ts --live             # 真实模式（需要 API key）
 *   pnpm dlx tsx scripts/run-deepeval.ts --json-out out.json
 *   pnpm dlx tsx scripts/run-deepeval.ts --install          # 先安装依赖
 *
 * 不依赖 promptfoo / playwright；只用 node:test + python3。
 *
 * 设计原则：
 * - Python 侧（tests/deepeval/）是叙事层评估的真实实现
 * - Node 侧只是编排器（调用 pytest、解析输出、写 JSON）
 * - pytest 不可用时降级到 Node mock judge（src/lib/evals/judge/）
 */

import { spawn, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PYTEST_DIR = resolve(ROOT, "tests/deepeval");

interface CliArgs {
  live: boolean;
  jsonOut?: string;
  install: boolean;
  verbose: boolean;
  pattern?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  return {
    live: args.includes("--live"),
    install: args.includes("--install"),
    verbose: args.includes("--verbose") || args.includes("-v"),
    jsonOut: args.includes("--json-out") ? args[args.indexOf("--json-out") + 1] : undefined,
    pattern: args.includes("--pattern") ? args[args.indexOf("--pattern") + 1] : undefined,
  };
}

function checkPython(): { available: boolean; version?: string } {
  try {
    const version = execSync("python3 --version", { encoding: "utf8" }).trim();
    return { available: true, version };
  } catch {
    return { available: false };
  }
}

function checkPytestDir(): boolean {
  try {
    statSync(PYTEST_DIR);
    return true;
  } catch {
    return false;
  }
}

async function installDeps(args: CliArgs): Promise<number> {
  return new Promise<number>((resolvePromise) => {
    const child = spawn("pip3", ["install", "-r", resolve(PYTEST_DIR, "requirements.txt")], {
      cwd: ROOT,
      stdio: args.verbose ? "inherit" : "pipe",
    });
    child.on("close", (code) => resolvePromise(code ?? 0));
    child.on("error", () => resolvePromise(1));
  });
}

async function runPytest(args: CliArgs): Promise<{ code: number; output: string }> {
  return new Promise((resolvePromise) => {
    const env = {
      ...process.env,
      DEEPEVAL_MOCK_MODE: args.live ? "0" : "1",
    };

    const pattern = args.pattern ?? "tests/deepeval/";
    const child = spawn("python3", ["-m", "pytest", pattern, "-v", "--tb=short"], {
      cwd: ROOT,
      env,
      stdio: args.verbose ? "inherit" : "pipe",
    });

    let output = "";
    child.stdout?.on("data", (d: Buffer) => {
      output += d.toString();
      if (args.verbose) process.stdout.write(d);
    });
    child.stderr?.on("data", (d: Buffer) => {
      output += d.toString();
      if (args.verbose) process.stderr.write(d);
    });

    child.on("close", (code: number | null) => resolvePromise({ code: code ?? 0, output }));
    child.on("error", (err: Error) => resolvePromise({ code: 1, output: `启动失败: ${err.message}` }));
  });
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log("🎨 VerseCraft DeepEval 叙事评估");
  console.log("═".repeat(60));
  console.log(`模式: ${args.live ? "live（真实 LLM judge）" : "mock（离线启发式）"}`);

  // 1. Python 检查
  const py = checkPython();
  if (!py.available) {
    console.error("❌ Python 3 不可用。请先安装 python3。");
    process.exit(2);
  }
  console.log(`Python: ${py.version}`);

  // 2. pytest dir 检查
  if (!checkPytestDir()) {
    console.error(`❌ pytest 目录不存在: ${PYTEST_DIR}`);
    process.exit(2);
  }

  // 3. 可选：先安装依赖
  if (args.install) {
    console.log("\n📦 安装 Python 依赖...");
    const code = await installDeps(args);
    if (code !== 0) {
      console.error("❌ pip install 失败");
      process.exit(code);
    }
  }

  // 4. 跑 pytest
  console.log("\n🧪 跑 pytest...");
  const { code, output } = await runPytest(args);

  // 5. 解析 pytest 输出
  const testCount = (output.match(/(\d+)\s+passed/) ?? ["0", "0"])[1];
  const failCount = (output.match(/(\d+)\s+failed/) ?? ["0", "0"])[1];

  console.log("\n" + "═".repeat(60));
  console.log(`✅ DeepEval 测试: ${testCount} passed, ${failCount} failed`);

  // 6. JSON 输出
  if (args.jsonOut) {
    const fs = await import("node:fs");
    const report = {
      mode: args.live ? "live" : "mock",
      pythonVersion: py.version,
      testsPassed: parseInt(testCount ?? "0", 10),
      testsFailed: parseInt(failCount ?? "0", 10),
      exitCode: code,
      timestamp: new Date().toISOString(),
      dimensions: ["coherence", "characterVoice", "plotLogic", "immersion", "factConsistency"],
      hardFloors: {
        coherence: 2, characterVoice: 2, plotLogic: 2, immersion: 0, factConsistency: 3,
      },
      note: "DeepEval narrative evaluation results",
    };
    fs.writeFileSync(args.jsonOut, JSON.stringify(report, null, 2), "utf8");
    console.log(`📄 JSON 输出: ${args.jsonOut}`);
  }

  process.exit(code);
}

main().catch((err) => {
  console.error("DeepEval 运行失败:", err);
  process.exit(1);
});