/**
 * 将检测结果转为紧凑 control augmentation（非自然语言长段）。
 */

import type { EpistemicAnomalyResult } from "./types";

const MAX_JSON_CHARS = 720;

export function buildNpcEpistemicAlertAugmentationBlock(result: EpistemicAnomalyResult): string {
  if (!result.anomaly) return "";

  const packet: Record<string, unknown> = {
    v: 1,
    npc_epistemic_alert_packet: true,
    npcId: result.npcId,
    reactionStyle: result.reactionStyle,
    severity: result.severity,
    triggerFactIds: result.triggerFactIds,
    requiredBehaviorTags: result.requiredBehaviorTags,
    forbiddenResponseTags: result.forbiddenResponseTags,
    mustInclude: result.mustInclude,
    mustAvoid: result.mustAvoid,
  };

  let json = JSON.stringify(packet);
  if (json.length > MAX_JSON_CHARS) {
    json = JSON.stringify({
      v: 1,
      npc_epistemic_alert_packet: true,
      npcId: result.npcId,
      reactionStyle: result.reactionStyle,
      severity: result.severity,
      triggerFactIds: result.triggerFactIds.slice(0, 4),
      requiredBehaviorTags: result.requiredBehaviorTags.slice(0, 6),
      forbiddenResponseTags: result.forbiddenResponseTags.slice(0, 6),
      mustInclude: result.mustInclude.slice(0, 4),
      mustAvoid: result.mustAvoid.slice(0, 4),
      _trimmed: true,
    });
  }

  return [
    "",
    "## 【npc_epistemic_alert_packet】",
    json,
    "主笔：对该 NPC 的对白须落实 reactionStyle 与 mustInclude/mustAvoid；禁止逐字复述本 JSON；仍输出合法顶层玩家 JSON。",
    "",
  ].join("\n");
}
