import test from "node:test";
import assert from "node:assert/strict";
import {
  clearNarrativeSystemsDebugRing,
  extractFilteredHintsFromTrace,
  getNarrativeSystemsDebugTail,
  pushEndingDecisionDebugEvent,
  pushNarrativeSystemsDebugEvent,
} from "@/lib/debug/narrativeSystemsDebugRing";

test("extractFilteredHintsFromTrace picks skip/reject lines", () => {
  const hints = extractFilteredHintsFromTrace([
    "clue:clue_abc",
    "objective_skip_unseen:ghost_task",
    "obtained_reject:FAKE-S:high_tier_unknown_id",
    "objective_dup:dup_id",
  ]);
  assert.ok(hints.includes("objective_skip_unseen:ghost_task"));
  assert.ok(hints.some((h) => h.startsWith("obtained_reject:")));
});

test("pushNarrativeSystemsDebugEvent respects ring cap when enabled", () => {
  const prev = process.env.VERSECRAFT_SYSTEMS_DEBUG;
  process.env.VERSECRAFT_SYSTEMS_DEBUG = "1";
  clearNarrativeSystemsDebugRing();
  try {
    for (let i = 0; i < 20; i++) {
      pushNarrativeSystemsDebugEvent({
        kind: "turn_commit",
        at: i,
        changeSetTrace: [],
        filteredHints: [],
        clueUpdatesInTurn: 0,
        newTasksInTurn: 0,
        taskUpdatesInTurn: 0,
        awardedItemsInTurn: 0,
        awardedWarehouseInTurn: 0,
        journalClueTotal: 0,
        taskTotal: 0,
        inventoryCount: 0,
        warehouseCount: 0,
      });
    }
    assert.equal(getNarrativeSystemsDebugTail(20).length, 20);
  } finally {
    if (prev === undefined) delete process.env.VERSECRAFT_SYSTEMS_DEBUG;
    else process.env.VERSECRAFT_SYSTEMS_DEBUG = prev;
    clearNarrativeSystemsDebugRing();
  }
});

test("pushEndingDecisionDebugEvent records sanitized ending decisions", () => {
  const prev = process.env.VERSECRAFT_SYSTEMS_DEBUG;
  process.env.VERSECRAFT_SYSTEMS_DEBUG = "1";
  clearNarrativeSystemsDebugRing();
  try {
    pushEndingDecisionDebugEvent({
      eventName: "ending_eligible_detected",
      payload: {
        runId: "run-a",
        outcome: "doom",
        endingPhase: "eligible",
        detectedAtTurn: 9,
        idempotencyKey: "run-a:doom:9",
        reasons: ["survival_hours_reached"],
        blockers: [],
        escapeStage: "final_window_open",
        survivalHours: 240,
        source: "time",
        snapshotPresent: false,
        settlementId: null,
        hiddenTruth: "should_not_be_copied",
      },
    });
    const [event] = getNarrativeSystemsDebugTail(1);
    assert.equal(event.kind, "ending_decision");
    if (event.kind === "ending_decision") {
      assert.equal(event.eventName, "ending_eligible_detected");
      assert.equal(event.outcome, "doom");
      assert.deepEqual(event.reasons, ["survival_hours_reached"]);
      assert.equal("hiddenTruth" in event, false);
    }
  } finally {
    if (prev === undefined) delete process.env.VERSECRAFT_SYSTEMS_DEBUG;
    else process.env.VERSECRAFT_SYSTEMS_DEBUG = prev;
    clearNarrativeSystemsDebugRing();
  }
});
