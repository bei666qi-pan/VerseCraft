import test from "node:test";
import assert from "node:assert/strict";
import { createInitialChapterState } from "@/lib/chapters";
import { createDefaultEscapeMainlineTemplate } from "@/lib/escapeMainline/template";
import { migratePersistedState, useGameStore } from "./useGameStore";

function resetStore() {
  const initial = (useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }).getInitialState();
  useGameStore.setState(initial, true);
}

function seedRun(overrides: Partial<ReturnType<typeof useGameStore.getState>> = {}) {
  useGameStore.setState({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    stats: { sanity: 10, agility: 1, luck: 1, charm: 1, background: 1 },
    time: { day: 1, hour: 2 },
    logs: [
      { role: "user", content: "look around" },
      { role: "assistant", content: "The corridor answers with cold silence." },
    ],
    playerLocation: "B1_SafeZone",
    currentOptions: ["A", "B", "C", "D"],
    historicalMaxFloorScore: 0,
    tasks: [],
    codex: {},
    journalClues: [],
    escapeMainline: createDefaultEscapeMainlineTemplate(0),
    ...overrides,
  });
}

test("ending store: legacy migration initializes ending state and preserves save surfaces", () => {
  const chapterState = createInitialChapterState();
  const migrated = migratePersistedState(
    {
      logs: [{ role: "assistant", content: "root log survives" }],
      chapterState,
      saveSlots: {
        main_slot: {
          stats: { sanity: 9, agility: 1, luck: 1, charm: 1, background: 1 },
          inventory: [],
          logs: [{ role: "assistant", content: "legacy log survives" }],
          time: { day: 1, hour: 3 },
          codex: {},
          historicalMaxSanity: 10,
          tasks: [],
          playerLocation: "B1_SafeZone",
          chapterState,
        },
      },
    },
    1
  ) as any;

  assert.equal(migrated.endingState.phase, "playing");
  assert.equal(migrated.logs[0].content, "root log survives");
  assert.equal(migrated.saveSlots.main_slot.logs[0].content, "legacy log survives");
  assert.equal(migrated.saveSlots.main_slot.runSnapshotV2.endingState.phase, "playing");
  assert.equal(migrated.saveSlots.main_slot.runSnapshotV2.chapterState.activeChapterId, chapterState.activeChapterId);
  assert.equal(typeof migrated.saveSlots.main_slot.runSnapshotV2.escape.stage, "string");
});

test("ending store: death after committed turn enters settlement_ready", () => {
  resetStore();
  seedRun({ stats: { sanity: 0, agility: 1, luck: 1, charm: 1, background: 1 } });

  const next = useGameStore.getState().evaluateEndingAfterTurn({
    resolvedTurn: { is_death: true },
    turnCount: 2,
    finalNarrative: "final death",
  });

  assert.equal(next.phase, "settlement_ready");
  assert.equal(next.settlementSnapshot?.outcome, "death");
  assert.equal(next.settlementSnapshot?.finalNarrative, "final death");
  assert.deepEqual(useGameStore.getState().currentOptions, []);
});

test("ending store: saveGame persists ending state and settlement snapshot", () => {
  resetStore();
  seedRun({ stats: { sanity: 0, agility: 1, luck: 1, charm: 1, background: 1 } });

  const next = useGameStore.getState().evaluateEndingAfterTurn({
    resolvedTurn: { is_death: true },
    turnCount: 2,
  });
  useGameStore.getState().saveGame("main_slot");

  const slot = useGameStore.getState().saveSlots.main_slot;
  assert.equal(slot.endingState?.phase, "settlement_ready");
  assert.equal(slot.endingSettlementSnapshot?.settlementId, next.settlementSnapshot?.settlementId);
  assert.equal(slot.runSnapshotV2?.endingState?.phase, "settlement_ready");
  assert.equal(
    slot.runSnapshotV2?.endingSettlementSnapshot?.settlementId,
    next.settlementSnapshot?.settlementId
  );
  assert.equal(slot.runSnapshotV2?.meta.runId, next.settlementSnapshot?.runId);
  assert.deepEqual(slot.currentOptions, []);
});

test("ending store: escaped_true after committed turn enters final-choice eligibility", () => {
  resetStore();
  seedRun({
    escapeMainline: {
      ...createDefaultEscapeMainlineTemplate(0),
      stage: "escaped_true",
      outcomeHint: { outcome: "true_escape", title: "true", toneLine: "" },
    },
  });

  const next = useGameStore.getState().evaluateEndingAfterTurn({ turnCount: 2 });

  assert.equal(next.phase, "eligible");
  assert.equal(next.eligibility?.outcome, "true_escape");
  assert.equal(next.settlementSnapshot, null);
  assert.deepEqual(useGameStore.getState().currentOptions, []);
});

test("ending store: doom after committed turn enters final-choice eligibility", () => {
  resetStore();
  seedRun({ time: { day: 10, hour: 5 } });

  const next = useGameStore.getState().evaluateEndingAfterTurn({ turnCount: 2 });

  assert.equal(next.phase, "eligible");
  assert.equal(next.eligibility?.outcome, "doom");
  assert.equal(next.settlementSnapshot, null);
});

test("ending store: repeated evaluation does not recreate settlement snapshot", () => {
  resetStore();
  seedRun({ stats: { sanity: 0, agility: 1, luck: 1, charm: 1, background: 1 } });

  const first = useGameStore.getState().evaluateEndingAfterTurn({
    resolvedTurn: { is_death: true },
    turnCount: 2,
  });
  const firstSnapshot = first.settlementSnapshot;
  const second = useGameStore.getState().evaluateEndingAfterTurn({
    resolvedTurn: { is_death: true },
    turnCount: 2,
  });

  assert.equal(second.phase, "settlement_ready");
  assert.equal(second.idempotencyKey, first.idempotencyKey);
  assert.equal(second.settlementSnapshot?.settlementId, firstSnapshot?.settlementId);
  assert.equal(second.settlementSnapshot, firstSnapshot);
});

test("ending store: resetForNewGame clears ending state", () => {
  resetStore();
  seedRun({ stats: { sanity: 0, agility: 1, luck: 1, charm: 1, background: 1 } });
  useGameStore.getState().evaluateEndingAfterTurn({ resolvedTurn: { is_death: true }, turnCount: 2 });
  assert.equal(useGameStore.getState().endingState.phase, "settlement_ready");

  useGameStore.getState().resetForNewGame();

  assert.equal(useGameStore.getState().endingState.phase, "playing");
  assert.equal(useGameStore.getState().endingState.settlementSnapshot, null);
});

test("ending store: final choice plus final narrative creates immutable settlement snapshot", () => {
  resetStore();
  seedRun({
    escapeMainline: {
      ...createDefaultEscapeMainlineTemplate(0),
      stage: "escaped_true",
      outcomeHint: { outcome: "true_escape", title: "true", toneLine: "" },
    },
  });

  const eligible = useGameStore.getState().evaluateEndingAfterTurn({ turnCount: 2 });
  assert.equal(eligible.phase, "eligible");

  const selected = useGameStore.getState().selectEndingFinalAction({
    id: "true_door",
    label: "推开真正的门",
    description: "确认最终出口。",
    outcome: "true_escape",
    selectedAt: "2026-05-08T00:00:00.000Z",
  });
  assert.equal(selected.phase, "final_turn_pending");

  const ready = useGameStore.getState().commitEndingFinalNarrative("这是最终叙事。");
  assert.equal(ready.phase, "settlement_ready");
  assert.equal(ready.settlementSnapshot?.outcome, "true_escape");
  assert.equal(ready.settlementSnapshot?.finalChoiceLabel, "推开真正的门");
  assert.equal(ready.settlementSnapshot?.finalNarrative, "这是最终叙事。");
});
