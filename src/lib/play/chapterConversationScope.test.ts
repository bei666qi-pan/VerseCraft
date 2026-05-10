import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateChapterChatSliceStart,
  resolveDisplayScopeStartForNewChapterBridge,
  CHAPTER_ENTRY_CHAT_BRIDGE_MESSAGE_CAP,
} from "@/lib/play/chapterConversationScope";

test("resolveDisplayScopeStartForNewChapterBridge keeps paired user bubble before assistant capstone", () => {
  const logs = [{ role: "assistant" }, { role: "user" }, { role: "assistant" }] as const;
  const start = resolveDisplayScopeStartForNewChapterBridge({ logs: [...logs], prevCompletedLogIndex: 2 });
  assert.equal(start, 1);
});

test("resolveDisplayScopeStartForNewChapterBridge uses capstone index when no preceding user", () => {
  const logs = [{ role: "assistant" }] as const;
  const start = resolveDisplayScopeStartForNewChapterBridge({ logs: [...logs], prevCompletedLogIndex: 0 });
  assert.equal(start, 0);
});

test("calculateChapterChatSliceStart widens anchor for fresh chapter turns", () => {
  const h = CHAPTER_ENTRY_CHAT_BRIDGE_MESSAGE_CAP + 5;
  const slice = calculateChapterChatSliceStart({
    startedLogIndex: null,
    activeChapterOrder: 2,
    chapterTurnCount: 0,
    historyLength: h,
  });
  assert.equal(slice, 5);
});

test("calculateChapterChatSliceStart keeps startedLogIndex overlap rule", () => {
  assert.equal(
    calculateChapterChatSliceStart({
      startedLogIndex: 12,
      activeChapterOrder: 2,
      chapterTurnCount: 2,
      historyLength: 20,
    }),
    10
  );
});
