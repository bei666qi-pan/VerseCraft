import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceChapterPacing,
  normalizeChapterPacingState,
} from "./chapterPacingController";

test("legacy storyDirector state migrates losslessly into chapter pacing state", () => {
  const state = normalizeChapterPacingState(
    {
      v: 1,
      arcId: "legacy_arc",
      beatIndex: 7,
      tension: 43,
      stallCount: 2,
      chapter: {
        currentChapterId: "chapter-2",
        chapterOrder: 2,
        chapterTitle: "旧章",
      },
    },
    8,
  );

  assert.equal(state.arcId, "legacy_arc");
  assert.equal(state.beatIndex, 7);
  assert.equal(state.tension, 43);
  assert.equal(state.chapter.currentChapterId, "chapter-2");
  assert.equal(state.chapter.chapterTitle, "旧章");
});

test("chapter pacing advances deterministically without returning a client incident queue", () => {
  const result = advanceChapterPacing({
    stateRaw: null,
    nowTurn: 1,
    pre: {
      playerLocation: "B1_SafeZone",
      tasks: [],
      mainThreatByFloor: {},
      memoryEntries: [],
    },
    post: {
      playerLocation: "1F_Lobby",
      tasks: [],
      mainThreatByFloor: {},
      memoryEntries: [],
    },
    resolvedTurn: { narrative: "你走进一层大厅。" },
  });

  assert.equal(result.state.beatIndex, 1);
  assert.equal("incidentQueue" in result, false);
  assert.equal("armedIncident" in result, false);
});
