import type { PlayWaitUxStage } from "./waitUxStages";
import type { PlaySemanticWaitingKind } from "@/features/play/components/PlaySemanticWaitingHint";

/** 主行：短、克制、有过程感，不暴露模型术语。 */
export const PLAY_WAIT_UX_PRIMARY_COPY: Record<Exclude<PlayWaitUxStage, "idle">, string> = {
  request_sent: "行动已送出",
  routing: "正在判断行动影响",
  context_building: "正在整理现场线索",
  generating: "正在写下后果",
  streaming: "正文开始流动",
  finalizing: "正在收束本回合",
};

/** 中等等待时的副行：和行动类型弱相关，克制，不给固定剩余时间。 */
export function playWaitUxSemanticSubline(kind: PlaySemanticWaitingKind | null): string | null {
  switch (kind) {
    case "explore":
      return "公寓的空间正在回应你的选择";
    case "dialogue":
      return "对方的反应正在被写入现场";
    case "combat":
      return "行动后果正在压向你";
    case "use_item":
      return "道具与现场规则正在对齐";
    case "investigate":
      return "线索正在从暗处浮出";
    case "meta":
      return "当前状态正在重新对齐";
    case "unknown":
    case null:
    case undefined:
      return "公寓正在回应你的选择";
    default:
      return "公寓正在回应你的选择";
  }
}

export function primaryLineForWaitStage(stage: PlayWaitUxStage): string {
  if (stage === "idle") return "";
  return PLAY_WAIT_UX_PRIMARY_COPY[stage] ?? "";
}
