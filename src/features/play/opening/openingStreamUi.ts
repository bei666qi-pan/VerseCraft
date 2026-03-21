import { doesChatPhaseLockInteraction } from "@/features/play/stream/chatPhase";
import type { ChatStreamPhase } from "@/features/play/stream/types";

/**
 * 开局「主笔推演」提示与流式区抑制：必须同时满足「开局请求标记」与「会话阶段仍锁定」。
 * 避免 `openingAiBusy` 与 `streamPhase` 短暂脱钩时出现文案永久悬挂。
 */
export function computeOpeningBusyUi(openingAiBusy: boolean, streamPhase: ChatStreamPhase): boolean {
  return openingAiBusy && doesChatPhaseLockInteraction(streamPhase);
}

/** 无活跃流式阶段却仍占 in-flight：视为僵尸状态，应清标记以免阻塞重试与 UI。 */
export function shouldRecoverStaleSendActionFlight(
  sendActionInFlight: boolean,
  streamPhase: ChatStreamPhase
): boolean {
  return sendActionInFlight && streamPhase === "idle";
}
