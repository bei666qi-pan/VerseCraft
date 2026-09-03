#!/usr/bin/env tsx
/**
 * VerseCraft Promptfoo 运行器
 *
 * 用途：运行武器/职业的确定性断言测试。
 * 这些测试使用 mock provider，不调真实 LLM，完全离线、秒出结果。
 *
 * 用法：
 *   pnpm dlx tsx scripts/run-promptfoo.ts              # 全量运行
 *   pnpm dlx tsx scripts/run-promptfoo.ts --weapon      # 仅武器 schema
 *   pnpm dlx tsx scripts/run-promptfoo.ts --profession  # 仅职业规则
 *   pnpm dlx tsx scripts/run-promptfoo.ts --json        # JSON 输出
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONFIG_PATH = resolve(ROOT, "promptfooconfig.yaml");
interface CliArgs {
  weapon: boolean;
  profession: boolean;
  refusal: boolean;
  economy: boolean;
  narrative: boolean;
  safety: boolean;
  npc: boolean;
  agency: boolean;
  json: boolean;
  verbose: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  return {
    weapon: args.includes("--weapon"),
    profession: args.includes("--profession"),
    refusal: args.includes("--refusal"),
    economy: args.includes("--economy"),
    narrative: args.includes("--narrative"),
    safety: args.includes("--safety"),
    npc: args.includes("--npc"),
    agency: args.includes("--agency"),
    json: args.includes("--json"),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

/**
 * 使用 Node 内置测试运行器执行确定性断言。
 * 这种方式不需要真实 promptfoo CLI，而是用现有的 mock provider 和断言逻辑。
 */
async function runWithNodeTest(args: CliArgs): Promise<number> {
  const testFiles: string[] = [];

  // 检查是否有单个类别过滤
  const hasFilter = args.weapon || args.profession || args.refusal || args.economy ||
                    args.narrative || args.safety || args.npc || args.agency;

  if (args.weapon) {
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/weapon-schema.test.ts"));
  }
  if (args.profession) {
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/profession-rules.test.ts"));
  }
  if (args.refusal) {
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/refusal-path.test.ts"));
  }
  if (args.economy) {
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/economy-rules.test.ts"));
  }
  if (args.narrative) {
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/narrative-quality.test.ts"));
  }
  if (args.safety) {
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/narrative-safety.test.ts"));
  }
  if (args.npc) {
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/npc-consistency.test.ts"));
  }
  if (args.agency) {
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/player-agency.test.ts"));
  }

  if (!hasFilter) {
    // 全量
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/weapon-schema.test.ts"));
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/profession-rules.test.ts"));
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/refusal-path.test.ts"));
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/economy-rules.test.ts"));
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/narrative-quality.test.ts"));
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/narrative-safety.test.ts"));
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/npc-consistency.test.ts"));
    testFiles.push(resolve(ROOT, "tests/promptfoo/tests/player-agency.test.ts"));
  }

  // 检查文件是否存在
  const validFiles: string[] = [];
  for (const f of testFiles) {
    try {
      statSync(f);
      validFiles.push(f);
    } catch {
      console.warn(`⚠️  测试文件不存在，跳过: ${f}`);
    }
  }

  if (validFiles.length === 0) {
    console.error("❌ 没有找到有效的测试文件");
    return 1;
  }

  const globPattern = validFiles.length === 2
    ? "tests/promptfoo/tests/{weapon-schema,profession-rules}.test.ts"
    : validFiles.map((f) => f.replace(ROOT + "/", "")).join(" ");

  return new Promise<number>((resolvePromise) => {
    const child = spawn("npx", ["tsx", "--test", globPattern], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        AI_PROVIDER: "mock",
        NODE_ENV: "test",
      },
    });

    child.on("close", (code) => {
      resolvePromise(code ?? 0);
    });

    child.on("error", (err) => {
      console.error("❌ 启动测试进程失败:", err.message);
      resolvePromise(1);
    });
  });
}

/**
 * 在线模式：使用 promptfoo CLI（如果已安装）
 */
async function runWithPromptfooCli(args: CliArgs): Promise<number> {
  const filterArgs: string[] = [];
  if (args.weapon) {
    filterArgs.push("--filter-weapon");
  }

  return new Promise<number>((resolvePromise) => {
    const child = spawn("npx", ["promptfoo", "eval", "-c", CONFIG_PATH, ...filterArgs, "--no-cache"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        AI_PROVIDER: "mock",
      },
    });

    child.on("close", (code) => {
      resolvePromise(code ?? 0);
    });

    child.on("error", () => {
      // promptfoo 可能未安装，降级到 Node test
      console.log("⚠️  promptfoo CLI 不可用，降级到 Node 内置测试...");
      resolvePromise(runWithNodeTest(args));
    });
  });
}

// === 主入口 ===

async function main(): Promise<void> {
  const args = parseArgs();

  console.log("🧪 VerseCraft Promptfoo 确定性断言测试");
  console.log("═".repeat(50));
  console.log(`模式: mock (离线，不调 LLM)`);
  console.log(
    `范围: ${args.weapon ? "武器schema" :
      args.profession ? "职业规则" :
      args.refusal ? "拒绝路径" :
      args.economy ? "经济规则" :
      args.narrative ? "叙事质量" :
      args.safety ? "叙事安全" :
      args.npc ? "NPC一致性" :
      args.agency ? "玩家选择" :
      "全部(8个类别)"}`
  );

  // 优先使用 Node 内置测试（更可控，不需要额外依赖）
  const exitCode = args.json
    ? await runWithPromptfooCli(args)
    : await runWithNodeTest(args);

  if (exitCode === 0) {
    console.log("\n✅ 全部确定性断言通过");
  } else {
    console.log("\n❌ 部分断言失败");
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("运行失败:", err);
  process.exit(1);
});
