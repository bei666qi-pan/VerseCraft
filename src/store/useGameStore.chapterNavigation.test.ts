import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAPTER_ONE_ID,
  CHAPTER_TWO_ID,
  createInitialChapterState,
  getChapterDefinition,
  recordChapterTurnInState,
} from "@/lib/chapters";
import type { ChapterTurnSignals } from "@/lib/chapters";
import { useGameStore } from "./useGameStore";

function resetStore() {
  const initial = (
    useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }
  ).getInitialState();
  useGameStore.setState(initial, true);
}

function completionSignals(turn: number): ChapterTurnSignals {
  return {
    source: "manual",
    isLegalAction: true,
    narrativeText: "门缝后的潮气与脚步声把线索推向更深处。".repeat(100),
    previousLocation: "B1_SafeZone",
    nextLocation: "B1_Storage",
    codexUpdateCount: 1,
    clueUpdateCount: 1,
    resultLines: ["你确认了当前区域存在异常。"],
    clueLines: ["线索指向门后的回声。"],
    logCountBefore: turn,
    logCountAfter: turn + 2,
  };
}

test("chapter end confirmation clears the completed recap after the engine already entered chapter two", () => {
  resetStore();
  const first = getChapterDefinition(CHAPTER_ONE_ID)!;
  let chapterState = createInitialChapterState(1);
  for (let turn = 0; turn < first.minTurns; turn += 1) {
    chapterState = recordChapterTurnInState({
      state: chapterState,
      definition: first,
      signals: completionSignals(turn),
      now: turn + 2,
    });
  }
  assert.equal(chapterState.activeChapterId, CHAPTER_TWO_ID);
  assert.equal(chapterState.pendingChapterEndId, CHAPTER_ONE_ID);
  useGameStore.setState({ chapterState });

  useGameStore.getState().enterNextChapter();

  const next = useGameStore.getState().chapterState;
  assert.equal(next.activeChapterId, CHAPTER_TWO_ID);
  assert.equal(next.currentChapterId, CHAPTER_TWO_ID);
  assert.equal(next.pendingChapterEndId, null);
});
