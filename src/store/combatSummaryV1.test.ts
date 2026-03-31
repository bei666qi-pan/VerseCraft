import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "./useGameStore";

function resetStore() {
  const initial = (useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }).getInitialState();
  useGameStore.setState(initial, true);
}

test("combatSummaryV1: pushCombatSummaryV1 stores capped rows", () => {
  resetStore();
  const s = useGameStore.getState();
  for (let i = 0; i < 20; i++) {
    s.pushCombatSummaryV1({
      atTurn: i,
      atHour: 100 + i,
      locationId: "1F_Hallway",
      npcIds: ["N-010"],
      kind: "subdue",
      outcomeTier: "edge",
      text: `t${i}`,
    });
  }
  const rows = useGameStore.getState().combatSummariesV1 ?? [];
  assert.equal(rows.length, 12);
  assert.equal(rows[0]!.text, "t8");
  assert.equal(rows[11]!.text, "t19");
});

