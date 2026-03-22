/**
 * 交互式写入或更新仓库根目录 `.env.local` 中的 AI 网关相关键。
 * 会先询问是否备份已有文件；直接回车可跳过某键（保留原值）。
 *
 * 用法：pnpm patch:env-local-ai
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env.local");

const KEYS = [
  { key: "AI_GATEWAY_PROVIDER", defaultStatic: "oneapi" },
  { key: "AI_GATEWAY_BASE_URL", defaultStatic: "http://127.0.0.1:3000" },
  { key: "AI_GATEWAY_API_KEY", defaultStatic: "" },
  { key: "AI_MODEL_MAIN", defaultStatic: "vc-main" },
  { key: "AI_MODEL_CONTROL", defaultStatic: "vc-control" },
  { key: "AI_MODEL_ENHANCE", defaultStatic: "vc-enhance" },
  { key: "AI_MODEL_REASONER", defaultStatic: "vc-reasoner" },
];

function unquoteValue(raw) {
  const s = String(raw).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1).replace(/\\(["'\\])/g, "$1");
  }
  return s;
}

function parseEnvMap(content) {
  const map = Object.create(null);
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) map[m[1]] = unquoteValue(m[2]);
  }
  return map;
}

function escapeForDoubleQuotedEnv(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");
}

function upsertLine(content, key, value) {
  const line = `${key}="${escapeForDoubleQuotedEnv(value)}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    return content.replace(re, line);
  }
  const needsNl = content.length > 0 && !content.endsWith("\n");
  const prefix = needsNl ? "\n" : "";
  const header =
    content.includes("# VerseCraft AI gateway") || content.trim() === ""
      ? ""
      : "\n# VerseCraft AI gateway (pnpm patch:env-local-ai)\n";
  return content + prefix + header + line + "\n";
}

async function main() {
  const rl = createInterface({ input, output });

  console.log(
    "[patch-env-local-ai] 将更新或追加以下键：" +
      KEYS.map((k) => k.key).join(", ")
  );
  console.log(`目标文件：${ENV_PATH}`);
  console.log("每项直接回车表示跳过（保留文件中已有值；无则使用括号内默认）。");

  if (existsSync(ENV_PATH)) {
    const bak = await rl.question(
      "是否先备份为 .env.local.bak.<时间戳>？(y/N): "
    );
    if (/^y(es)?$/i.test(bak.trim())) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const dest = resolve(process.cwd(), `.env.local.bak.${stamp}`);
      copyFileSync(ENV_PATH, dest);
      console.log(`已备份：${dest}`);
    }
  } else {
    const create = await rl.question(
      "未找到 .env.local。是否新建（仅含本次写入的键；建议仍先 cp .env.example .env.local）？(y/N): "
    );
    if (!/^y(es)?$/i.test(create.trim())) {
      console.log("已取消。请先执行：cp .env.example .env.local");
      rl.close();
      process.exitCode = 1;
      return;
    }
  }

  let content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const current = parseEnvMap(content);

  for (const { key, defaultStatic } of KEYS) {
    const fromFile = current[key];
    const def = fromFile !== undefined && fromFile !== "" ? fromFile : defaultStatic;
    const label =
      key === "AI_GATEWAY_API_KEY"
        ? `${key}（留空则跳过）`
        : `${key}（默认 ${def || "（空）"}）`;
    const ans = (await rl.question(`${label}: `)).trim();
    if (ans === "") {
      if (fromFile !== undefined) continue;
      if (defaultStatic === "") continue;
      content = upsertLine(content, key, defaultStatic);
      current[key] = defaultStatic;
      continue;
    }
    content = upsertLine(content, key, ans);
    current[key] = ans;
  }

  writeFileSync(ENV_PATH, content, "utf8");
  console.log(`[patch-env-local-ai] 已写入 ${ENV_PATH}`);
  console.log("建议接着执行：pnpm verify:ai-gateway && pnpm probe:ai-gateway");

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
