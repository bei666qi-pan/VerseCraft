/**
 * NPC 人格卡 Prompt Block 构建器
 *
 * 从 Persona Card 注册表中选取在场 NPC 的人格卡，
 * 构建紧凑的 prompt 注入块，供 AI DM 在生成叙事时参考。
 */

import type { NpcPersonaCard } from "./types";

function clamp(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 1) + "…";
}

function buildSinglePersonaBlock(card: NpcPersonaCard): string {
  const lines: string[] = [];
  lines.push(`${card.displayName}（${card.npcId}）`);

  // 精简的人格摘要
  const b = card.big5;
  const highTraits: string[] = [];
  const lowTraits: string[] = [];
  if (b.openness >= 7) highTraits.push("开放");
  if (b.openness <= 3) lowTraits.push("务实");
  if (b.conscientiousness >= 7) highTraits.push("自律");
  if (b.conscientiousness <= 3) lowTraits.push("散漫");
  if (b.extraversion >= 7) highTraits.push("外向");
  if (b.extraversion <= 3) lowTraits.push("内向");
  if (b.agreeableness >= 7) highTraits.push("合作");
  if (b.agreeableness <= 3) lowTraits.push("怀疑");
  if (b.neuroticism >= 7) highTraits.push("警觉");
  if (b.neuroticism <= 3) lowTraits.push("沉稳");

  const traitParts: string[] = [];
  if (highTraits.length > 0) traitParts.push(highTraits.join("·"));
  if (lowTraits.length > 0) traitParts.push(lowTraits.join("·"));
  if (traitParts.length > 0) lines.push(`  人格：${traitParts.join(" / ")}`);

  // 口吻
  const voiceSample = card.voiceRules.slice(0, 3).join("；");
  lines.push(`  口吻：${voiceSample}`);

  // 知道 vs 不知道
  const known = card.knownFacts.slice(0, 2).join("、");
  const unknown = card.unknownFacts.slice(0, 2).join("、");
  if (known) lines.push(`  知道：${known}`);
  if (unknown) lines.push(`  不知：${unknown}`);

  // 当前目标
  lines.push(`  动机：${card.currentGoal}`);

  // 恐惧（只取 1 条最核心的）
  if (card.fears.length > 0) {
    lines.push(`  恐惧：${card.fears[0]}`);
  }

  // 与玩家关系
  lines.push(`  对玩家：${card.playerRelationship}`);

  // 危机行为
  lines.push(`  危机：${card.crisisBehavior}`);

  // 硬性约束（取前 2 条）
  if (card.hardConstraints.length > 0) {
    lines.push(`  禁止：${card.hardConstraints.slice(0, 2).join("；")}`);
  }

  return lines.join("\n");
}

/**
 * 构建 NPC 人格卡 prompt 注入块。
 * @param cards 当前场景相关的 NPC 人格卡（最多 3 个）
 * @param maxChars 总字符预算
 */
export function buildNpcPersonaPromptBlock(args: {
  cards: NpcPersonaCard[];
  maxChars?: number;
}): string {
  const { cards, maxChars = 800 } = args;
  if (cards.length === 0) return "";

  const blocks = cards.map((c) => buildSinglePersonaBlock(c));
  const header = "## 【NPC 人格参考 — 关键角色行为指南】\n你正在扮演以下 NPC。请严格遵守每个人格卡的口吻、动机和约束：\n";
  const fullText = header + blocks.join("\n\n---\n\n");

  return clamp(fullText, maxChars);
}

/**
 * 紧凑版：仅保留口吻和核心约束，用于 budget 紧张的场景。
 */
export function buildNpcPersonaPromptBlockCompact(args: {
  cards: NpcPersonaCard[];
  maxChars?: number;
}): string {
  const { cards, maxChars = 360 } = args;
  if (cards.length === 0) return "";

  const blocks = cards.map((c) => {
    const b = c.big5;
    const traitTags: string[] = [];
    if (b.openness >= 7) traitTags.push("开放");
    if (b.openness <= 3) traitTags.push("务实");
    if (b.agreeableness >= 7) traitTags.push("合作");
    if (b.agreeableness <= 3) traitTags.push("怀疑");
    if (b.neuroticism >= 7) traitTags.push("警觉");
    const voice = c.voiceRules.slice(0, 2).join("；");
    const constraint = c.hardConstraints.slice(0, 1).join("；");
    return [
      `${c.displayName}（${c.npcId}）[${traitTags.join("·")}]`,
      `口吻：${voice}`,
      `动机：${c.currentGoal}`,
      constraint ? `禁止：${constraint}` : "",
    ].filter(Boolean).join(" | ");
  });

  const fullText = `【NPC人格】${blocks.join(" || ")}`;
  return clamp(fullText, maxChars);
}
