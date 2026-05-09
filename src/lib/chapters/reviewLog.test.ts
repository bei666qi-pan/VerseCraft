import assert from "node:assert/strict";
import test from "node:test";
import { selectChapterReviewLogEntries } from "./reviewLog";
import type { ChapterProgress } from "./types";

function progress(overrides: Partial<ChapterProgress> = {}): ChapterProgress {
  return {
    chapterId: "chapter-1",
    status: "completed",
    startedAt: 1,
    completedAt: 2,
    turnCount: 1,
    narrativeCharCount: 10,
    keyChoiceCount: 1,
    completedBeatIds: [],
    stateChangeCount: 1,
    startedLogIndex: 1,
    completedLogIndex: 3,
    ...overrides,
  };
}

test("selectChapterReviewLogEntries slices completed chapter dialogue by log range", () => {
  const entries = selectChapterReviewLogEntries(
    [
      { role: "assistant", content: "opening" },
      { role: "user", content: "chapter user line" },
      { role: "assistant", content: "chapter answer one" },
      { role: "assistant", content: "chapter answer two" },
      { role: "assistant", content: "next chapter" },
    ],
    progress()
  );

  assert.deepEqual(entries.map((entry) => entry.content), [
    "chapter user line",
    "chapter answer one",
    "chapter answer two",
  ]);
  assert.deepEqual(entries.map((entry) => entry.logIndex), [1, 2, 3]);
});

test("selectChapterReviewLogEntries ignores non-story rows and invalid ranges", () => {
  assert.deepEqual(
    selectChapterReviewLogEntries(
      [
        { role: "system", content: "hidden" },
        { role: "assistant", content: "visible" },
      ],
      progress({ startedLogIndex: 0, completedLogIndex: 1 })
    ),
    [{ role: "assistant", content: "visible", logIndex: 1 }]
  );
  assert.deepEqual(
    selectChapterReviewLogEntries([{ role: "assistant", content: "visible" }], progress({ startedLogIndex: 2, completedLogIndex: 0 })),
    []
  );
});
