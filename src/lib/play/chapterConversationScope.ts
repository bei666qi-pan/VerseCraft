// src/lib/play/chapterConversationScope.ts

/** Max assistant/user bubble pairs-ish window when bridging into a chapter with unknown startedLogIndex. */
export const CHAPTER_ENTRY_CHAT_BRIDGE_MESSAGE_CAP = 8;

/** Number of log entries retained before `startedLogIndex` so the last exchange of the prior chapter stays visible. */
export const CHAPTER_DISPLAY_OVERLAP = 3;

type LogRoleRow = { role?: string };

/**
 * Visible story log index after a chapter completes: keep the closing exchange from the prior chapter,
 * optionally including the last user bubble before the assistant capstone.
 */
export function resolveDisplayScopeStartForNewChapterBridge(args: {
  logs: ReadonlyArray<LogRoleRow | null | undefined>;
  prevCompletedLogIndex: number | null;
}): number {
  const { logs, prevCompletedLogIndex } = args;
  if (prevCompletedLogIndex === null) return 0;
  const capped = Math.max(0, Math.trunc(prevCompletedLogIndex));
  const lastIdx = logs.length > 0 ? logs.length - 1 : -1;
  if (lastIdx < 0) return 0;
  const idx = Math.min(capped, lastIdx);
  const row = logs[idx];
  const prevRow = idx > 0 ? logs[idx - 1] : undefined;
  if (row?.role === "assistant" && prevRow?.role === "user") {
    return Math.max(0, idx - 1);
  }
  return idx;
}

/**
 * First index passed to DM `/api/chat` message history slicing (still bounded globally server-side).
 */
export function calculateChapterChatSliceStart(args: {
  startedLogIndex: number | null;
  activeChapterOrder: number;
  chapterTurnCount: number;
  historyLength: number;
}): number {
  const { startedLogIndex, activeChapterOrder, chapterTurnCount, historyLength } = args;
  if (startedLogIndex !== null && Number.isFinite(startedLogIndex)) {
    return Math.max(0, Math.trunc(startedLogIndex) - 2);
  }
  if (activeChapterOrder > 1 && chapterTurnCount === 0) {
    return Math.max(0, historyLength - CHAPTER_ENTRY_CHAT_BRIDGE_MESSAGE_CAP);
  }
  return 0;
}
