/**
 * v4 护城河：校验 playerChatSystemPrompt.ts 的 canonical 名册与 NPCS + NPC_ALIASES 一致。
 *
 * 用法：
 *   pnpm prompts:regen:verify
 *
 * 行为：
 * - 读取 NPCS 表与 NPC_ALIASES
 * - 计算期望的"陈婆婆N-001, 林医生N-002, ..."单行字符串
 * - 读取 playerChatSystemPrompt.ts:151（手维护的 canonical 行）
 * - 比对两者是否一致
 * - 一致：exit 0；不一致：打印 diff 并 exit 1
 *
 * 这条校验是 baked prompt 与 NPCS 不漂移的硬约束。
 * 新增/删除/重命名 NPC 时必须同步更新 playerChatSystemPrompt.ts:151 那一行。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { NPCS } from "../src/lib/registry/npcs";
import { NPC_ALIASES } from "../src/lib/registry/npcAliases";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const PROMPT_FILE = path.join(REPO_ROOT, "src/lib/playRealtime/playerChatSystemPrompt.ts");

// 期望的 canonical 名册格式：`name id, name id, ...`（中文逗号 + 空格）
const expected = NPCS.map((n) => `${n.name}N-${n.id.slice(2).padStart(3, "0")}`).join(", ");

// 从 playerChatSystemPrompt.ts 中抽取第 150 行的 canonical name list
const source = readFileSync(PROMPT_FILE, "utf8");
const lines = source.split("\n");

// 找包含 "canonical 名必须用于对话" 的段落
let canonicalLine = -1;
for (let i = 0; i < lines.length; i += 1) {
  if (lines[i].includes("canonical 名必须用于对话")) {
    canonicalLine = i + 1; // 实际行号（注释下方一行）
    break;
  }
}

if (canonicalLine < 0 || canonicalLine >= lines.length) {
  console.error("❌ verify-canonical-name-prompt: 找不到 canonical 名册段。");
  console.error("  预期在 playerChatSystemPrompt.ts 中有 'canonical 名必须用于对话' 一行。");
  process.exit(1);
}

let actualLine = lines[canonicalLine].trim();
// 去掉行首/行尾的引号（源文件是字符串字面量）
actualLine = actualLine.replace(/^["']|["'],?\s*$/g, "");
// 去掉结尾的句号、逗号、空格
const actual = actualLine.replace(/[。，\s,]+$/, "").trim();

if (actual !== expected) {
  console.error("❌ verify-canonical-name-prompt: canonical 名册与 NPCS 不一致！");
  console.error("--- EXPECTED ---");
  console.error(expected);
  console.error("--- ACTUAL ---");
  console.error(actual);
  console.error("--- DIFF ---");
  const expSet = new Set(expected.split(/[,，]\s*/));
  const actSet = new Set(actual.split(/[,，]\s*/));
  const missing = [...expSet].filter((x) => !actSet.has(x));
  const extra = [...actSet].filter((x) => !expSet.has(x));
  if (missing.length) console.error("  missing in file:", missing);
  if (extra.length) console.error("  extra in file:", extra);
  process.exit(1);
}

console.log(
  `✅ verify-canonical-name-prompt: ${NPCS.length} NPC names verified in playerChatSystemPrompt.ts:152`,
);
if (Object.keys(NPC_ALIASES).length > 0) {
  const totalAliases = Object.values(NPC_ALIASES).flat().length;
  console.log(`   (${totalAliases} aliases in NPC_ALIASES — see npcAliases.ts)`);
}
