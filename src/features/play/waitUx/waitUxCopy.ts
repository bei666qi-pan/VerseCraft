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

/**
 * 等待主行已经提供了即时反馈；不再额外展示泛化的叙事加载副行，避免把加载过程误认为 AI 旁白。
 */
export function playWaitUxSemanticSubline(kind: PlaySemanticWaitingKind | null): string | null {
  void kind;
  return null;
}

export function primaryLineForWaitStage(stage: PlayWaitUxStage): string {
  if (stage === "idle") return "";
  return PLAY_WAIT_UX_PRIMARY_COPY[stage] ?? "";
}
