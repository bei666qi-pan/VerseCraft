import type { PlayWaitUxStage } from "./waitUxStages";
import type { PlaySemanticWaitingKind } from "@/features/play/components/PlaySemanticWaitingHint";

/** 主行：短、过程感、不暴露模型术语。 */
export const PLAY_WAIT_UX_PRIMARY_COPY: Record<Exclude<PlayWaitUxStage, "idle">, string> = {
  request_sent: "行动已送出",
  routing: "正在接通叙事",
  context_building: "正在整理上下文",
  generating: "正在写下一段",
  streaming: "正文流动中",
  finalizing: "正在收束本回合",
};

/** 仅在中等以上等待时显示的副行（与行动类型弱相关，克制不喧宾）。 */
export function playWaitUxSemanticSubline(kind: PlaySemanticWaitingKind | null): string | null {
  if (!kind || kind === "unknown") return null;
  switch (kind) {
    case "explore":
      return "场景与位置关系在对齐中";
    case "dialogue":
      return "对话脉络在对齐中";
    case "combat":
      return "行动后果在对齐中";
    case "use_item":
      return "道具与规则在对齐中";
    case "investigate":
      return "可查线索在对齐中";
    case "meta":
      return "界面状态在对齐中";
    default:
      return null;
  }
}

export function primaryLineForWaitStage(stage: PlayWaitUxStage): string {
  if (stage === "idle") return "";
  return PLAY_WAIT_UX_PRIMARY_COPY[stage] ?? "";
}
