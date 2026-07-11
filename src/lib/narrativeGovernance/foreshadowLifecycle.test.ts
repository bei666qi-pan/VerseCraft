import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDeadlineTurn,
  isDue,
  isExpired,
  pickDueEntries,
  markPayoff,
  markExpired,
  dueToDirectiveFragment,
  type ForeshadowEntry,
} from "./foreshadowLifecycle";

function makeEntry(overrides: Partial<ForeshadowEntry> = {}): ForeshadowEntry {
  return {
    id: 1,
    seedText: "走廊尽头有声响",
    source: "dm",
    plantedTurn: 10,
    status: "planted",
    deadlineTurn: 18,
    importance: 1,
    payoffTurn: null,
    ...overrides,
  };
}

test("computeDeadlineTurn: importance 1→8 turns", () => {
  assert.equal(computeDeadlineTurn(10, 1), 18);
});

test("computeDeadlineTurn: importance 2→16 turns", () => {
  assert.equal(computeDeadlineTurn(10, 2), 26);
});

test("computeDeadlineTurn: importance 3→24 turns", () => {
  assert.equal(computeDeadlineTurn(10, 3), 34);
});

test("computeDeadlineTurn: clamps importance to 1-3", () => {
  assert.equal(computeDeadlineTurn(10, 0), 18); // 0 → 1
  assert.equal(computeDeadlineTurn(10, 5), 34); // 5 → 3
});

test("isDue: true when currentTurn >= deadlineTurn - 3", () => {
  const e = makeEntry({ deadlineTurn: 18 });
  assert.equal(isDue(e, 14), false); // 14 < 15
  assert.equal(isDue(e, 15), true);  // 15 >= 15
  assert.equal(isDue(e, 20), true);  // past deadline still due
});

test("isDue: false when status is not planted", () => {
  const e = makeEntry({ status: "paid_off", deadlineTurn: 18 });
  assert.equal(isDue(e, 15), false);
});

test("isDue: false when deadlineTurn is null", () => {
  const e = makeEntry({ deadlineTurn: null });
  assert.equal(isDue(e, 100), false);
});

test("isExpired: true when currentTurn > deadlineTurn", () => {
  const e = makeEntry({ deadlineTurn: 18 });
  assert.equal(isExpired(e, 18), false);
  assert.equal(isExpired(e, 19), true);
});

test("isExpired: false when status is not planted", () => {
  const e = makeEntry({ status: "paid_off", deadlineTurn: 18 });
  assert.equal(isExpired(e, 19), false);
});

test("pickDueEntries: sorts by importance DESC then plantedTurn ASC", () => {
  const entries = [
    makeEntry({ id: 1, importance: 1, plantedTurn: 10, deadlineTurn: 18 }),
    makeEntry({ id: 2, importance: 2, plantedTurn: 12, deadlineTurn: 28 }),
    makeEntry({ id: 3, importance: 3, plantedTurn: 8, deadlineTurn: 32 }),
  ];
  // At turn 29: id2 is due (deadline 28, 29>=25), id1 is due (deadline 18, 29>=15), id3 not due (deadline 32, 29<29)
  const due = pickDueEntries(entries, 29, 2);
  assert.equal(due.length, 2);
  assert.equal(due[0]!.id, 3); // importance 3, plantedTurn 8
  assert.equal(due[1]!.id, 2); // importance 2, plantedTurn 12
});

test("pickDueEntries: caps at maxCount", () => {
  const entries = [
    makeEntry({ id: 1, importance: 1, deadlineTurn: 12 }),
    makeEntry({ id: 2, importance: 1, deadlineTurn: 13 }),
    makeEntry({ id: 3, importance: 1, deadlineTurn: 14 }),
  ];
  const due = pickDueEntries(entries, 20, 2);
  assert.equal(due.length, 2);
});

test("markPayoff returns paid_off with payoffTurn", () => {
  const e = makeEntry();
  const result = markPayoff(e, 15);
  assert.equal(result.status, "paid_off");
  assert.equal(result.payoffTurn, 15);
});

test("markExpired returns expired status", () => {
  const result = markExpired();
  assert.equal(result.status, "expired");
});

test("dueToDirectiveFragment: empty when no entries", () => {
  assert.equal(dueToDirectiveFragment([]), "");
});

test("dueToDirectiveFragment: formats summaries with truncation", () => {
  const entries = [
    makeEntry({ seedText: "走廊尽头有声响" }),
    makeEntry({ seedText: "一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的伏笔描述需要被截断处理" }),
  ];
  const frag = dueToDirectiveFragment(entries);
  assert.ok(frag.includes("如剧情自然"));
  assert.ok(frag.includes("「走廊尽头有声响」"));
  assert.ok(frag.includes("…")); // long text truncated
});
