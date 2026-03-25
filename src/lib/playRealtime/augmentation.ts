// src/lib/playRealtime/augmentation.ts
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";

/**
 * Injects control-plane + deterministic rule hints into the DM system prompt (Chinese labels).
 */
export function buildControlAugmentationBlock(args: {
  control: PlayerControlPlane | null;
  rule: PlayerRuleSnapshot;
  preflightFailed: boolean;
}): string {
  if (args.preflightFailed && !args.control) {
    return [
      "",
      "## 【控制层】",
      "控制面暂时不可用。请仅依据玩家状态、世界观与合规规则独立完成本回合 JSON；不要猜测缺失的控制标签。",
    ].join("\n");
  }

  if (!args.control) {
    return "";
  }

  const slots = args.control.extracted_slots ?? {};
  const slotLine = [
    slots.target ? `target=${slots.target}` : "",
    slots.item_hint ? `item_hint=${slots.item_hint}` : "",
    slots.location_hint ? `location_hint=${slots.location_hint}` : "",
  ]
    .filter(Boolean)
    .join("；");

  return [
    "",
    "## 【控制层输出（禁止逐字复述给玩家）】",
    `- 意图 intent=${args.control.intent}，confidence=${args.control.confidence}`,
    `- 风险 risk_level=${args.control.risk_level}；tags=${args.control.risk_tags.length ? args.control.risk_tags.join(",") : "none"}`,
    slotLine ? `- 槽位：${slotLine}` : "- 槽位：（无）",
    `- 叙事提示 dm_hints：${args.control.dm_hints || "（无）"}`,
    `- 规则快照 combat=${args.rule.in_combat_hint} dialogue=${args.rule.in_dialogue_hint} move=${args.rule.location_changed_hint} high_value=${args.rule.high_value_scene}`,
    args.control.block_dm
      ? `- 控制层建议拦截 block_dm=true：${args.control.block_reason || "（未提供原因）"}；若与合规冲突以合规为准。`
      : "",
    "主笔：输出标准玩家 JSON；用文学叙事体现意图与风险，不要引用本小节原文。",
  ]
    .filter(Boolean)
    .join("\n");
}
