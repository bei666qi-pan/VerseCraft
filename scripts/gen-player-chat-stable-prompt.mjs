import fs from "node:fs";

const routePath = "src/app/api/chat/route.ts";
const outPath = "src/lib/playRealtime/playerChatSystemPrompt.ts";

const s = fs.readFileSync(routePath, "utf8");
const fn = s.indexOf("function buildSystemPrompt(");
if (fn < 0) throw new Error("buildSystemPrompt not found");
const baseStart = s.indexOf("const base = [", fn);
const baseEnd = s.indexOf("\n  ];", baseStart);
if (baseStart < 0 || baseEnd < 0) throw new Error("base array bounds");
const bracketOpen = s.indexOf("[", baseStart);
let inner = `${s.slice(bracketOpen, baseEnd).trimEnd()}\n  ]`;
const lines = inner.split("\n");
const filtered = lines.filter(
  (l) =>
    !l.includes("memoryBlock ||") &&
    !l.includes("`当前玩家状态：${playerContext}`")
);
inner = filtered.join("\n");

const file =
  [
    "// Generated in-repo from route buildSystemPrompt static lines (see scripts/gen-player-chat-stable-prompt.mjs).",
    'import { NPCS } from "@/lib/registry/npcs";',
    'import { ANOMALIES } from "@/lib/registry/anomalies";',
    `import {
  buildLoreContextForDM,
  ENTITY_CARRIED_ITEMS,
  ENTITY_WAREHOUSE_ITEMS,
} from "@/lib/registry/world";`,
    'import { buildApartmentTruthBlock } from "@/lib/registry/apartmentTruth";',
    'import type { ChatMessage } from "@/lib/ai/types/core";',
    'import { envRaw } from "@/lib/config/envRaw";',
    "",
    "function getCodexCanonicalNamesBlock(): string {",
    '  const npcNames = NPCS.map((n) => `${n.id} ${n.name}`).join("，");',
    '  const anomalyNames = ANOMALIES.map((a) => `${a.id} ${a.name}`).join("，");',
    "  return `NPC 真名：${npcNames}。诡异真名：${anomalyNames}。`;",
    "}",
    "",
    "export type SessionMemoryForDm = {",
    "  plot_summary: string;",
    "  player_status: Record<string, unknown>;",
    "  npc_relationships: Record<string, unknown>;",
    "} | null;",
    "",
    'export function buildMemoryBlock(mem: SessionMemoryForDm): string {',
    '  if (!mem?.plot_summary) return "";',
    "  return [",
    '    "",',
    '    "## 【动态记忆（压缩剧情摘要）】",',
    '    "",',
    '    "【剧情摘要】",',
    "    mem.plot_summary,",
    '    "",',
    '    "【玩家状态快照】",',
    "    JSON.stringify(mem.player_status, null, 0).slice(0, 500),",
    '    "",',
    '    "【NPC 关系快照】",',
    "    JSON.stringify(mem.npc_relationships, null, 0).slice(0, 300),",
    '    "",',
    '  ].join("\\n");',
    "}",
    "",
    "/** Static DM rules + lore; no per-request variables. */",
    "export function buildStablePlayerDmSystemLines(): readonly string[] {",
    "  return " + inner + ";",
    "}",
    "",
    'const STABLE_SECTION_GLUE = "\\n\\n## 【本回合动态上下文】";',
    "",
    "let memoStablePrefix: string | undefined;",
    "let memoVersionKey: string | undefined;",
    "",
    "/**",
    " * Longest stable prefix for prompt/KV cache: full static instructions + lore + fixed section title.",
    " * Invalidated when env VERSECRAFT_DM_STABLE_PROMPT_VERSION changes.",
    " */",
    "export function getStablePlayerDmSystemPrefix(): string {",
    '  const v = (envRaw("VERSECRAFT_DM_STABLE_PROMPT_VERSION") ?? "").trim();',
    "  if (memoStablePrefix !== undefined && memoVersionKey === v) {",
    "    return memoStablePrefix;",
    "  }",
    "  memoVersionKey = v;",
    '  memoStablePrefix = buildStablePlayerDmSystemLines().join("\\n") + STABLE_SECTION_GLUE;',
    "  return memoStablePrefix;",
    "}",
    "",
    "/** Test helper: clear module memo. */",
    "export function __resetStablePlayerDmPrefixMemoForTests(): void {",
    "  memoStablePrefix = undefined;",
    "  memoVersionKey = undefined;",
    "}",
    "",
    "export interface PlayerDmDynamicSuffixInput {",
    "  memoryBlock: string;",
    "  playerContext: string;",
    "  isFirstAction: boolean;",
    "  controlAugmentation: string;",
    "}",
    "",
    "const FIRST_ACTION_CONSTRAINT =",
    '  "【开局叙事强制约束】对话历史为空，这是玩家的第一个动作！固定开场叙事已由客户端展示，你**禁止**在 narrative 中复述苏醒、头痛、环境细节或如月公寓设定。narrative 仅输出占位（如单个全角句号「。」）。**核心任务**：在 options 中输出恰好 4 条互不重复、符合地下一层安全区语境的第一人称行动建议（每条约五至二十字），每次开局随机变化、勿套模板；须覆盖探索、观察、社交、谨慎移动等不同倾向。";',
    "",
    "/** Per-turn tail: memory, player snapshot, optional first-action rule, control-plane augmentation. */",
    "export function buildDynamicPlayerDmSystemSuffix(input: PlayerDmDynamicSuffixInput): string {",
    "  const parts: string[] = [];",
    "  if (input.memoryBlock) parts.push(input.memoryBlock);",
    "  parts.push(`当前玩家状态：${input.playerContext}`);",
    "  if (input.isFirstAction) {",
    '    parts.push("", FIRST_ACTION_CONSTRAINT, "");',
    "  }",
    "  if (input.controlAugmentation) parts.push(input.controlAugmentation);",
    '  return parts.join("\\n");',
    "}",
    "",
    "export function composePlayerChatSystemMessages(",
    "  stablePrefix: string,",
    "  dynamicSuffix: string,",
    "  splitDualSystem: boolean",
    "): ChatMessage[] {",
    "  if (splitDualSystem) {",
    "    return [",
    '      { role: "system", content: stablePrefix },',
    '      { role: "system", content: dynamicSuffix },',
    "    ];",
    "  }",
    "  return [{ role: \"system\", content: `${stablePrefix}\\n\\n${dynamicSuffix}` }];",
    "}",
    "",
  ].join("\n") + "\n";

fs.writeFileSync(outPath, file, "utf8");
console.log("Wrote", outPath);
