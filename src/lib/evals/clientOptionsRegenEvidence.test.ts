import test from "node:test";
import assert from "node:assert/strict";
import { shouldRequestClientOptionsRegen } from "@/lib/evals/clientOptionsRegenEvidence";

// ── shouldRequestClientOptionsRegen edge cases ──────────────────

test("shouldRequestClientOptionsRegen: empty array triggers regen", () => {
  assert.equal(shouldRequestClientOptionsRegen([]), true);
});

test("shouldRequestClientOptionsRegen: single option triggers regen", () => {
  assert.equal(shouldRequestClientOptionsRegen(["检查门缝"]), true);
});

test("shouldRequestClientOptionsRegen: two options triggers regen", () => {
  assert.equal(shouldRequestClientOptionsRegen(["检查门缝", "沿走廊撤退"]), true);
});

test("shouldRequestClientOptionsRegen: three options triggers regen", () => {
  assert.equal(shouldRequestClientOptionsRegen(["一", "二", "三"]), true);
});

test("shouldRequestClientOptionsRegen: four or more options skip regen", () => {
  assert.equal(shouldRequestClientOptionsRegen(["一", "二", "三", "四"]), false);
  assert.equal(shouldRequestClientOptionsRegen(["一", "二", "三", "四", "五"]), false);
});

test("shouldRequestClientOptionsRegen: filters empty/whitespace strings", () => {
  // only 1 real option + 3 empty → should trigger regen
  assert.equal(shouldRequestClientOptionsRegen(["一", "", "  ", undefined, null]), true);
  // 4 real options → should skip regen
  assert.equal(shouldRequestClientOptionsRegen(["一", "二", "三", "四", "", null]), false);
});

test("shouldRequestClientOptionsRegen: non-string values do not count", () => {
  assert.equal(shouldRequestClientOptionsRegen([1, 2, 3, 4]), true); // numbers don't count as strings
  assert.equal(shouldRequestClientOptionsRegen([true, false, {}, []]), true); // non-strings filtered out
});

test("shouldRequestClientOptionsRegen: sparse array with empty slots still counts correctly", () => {
  // sparse array with holes — only real strings count
  const sparse = ["一", , "二", , "三"]; // length 5, but only 3 strings
  assert.equal(shouldRequestClientOptionsRegen(sparse), true);
  const full = ["一", "二", "三", "四", ,]; // 4 strings
  assert.equal(shouldRequestClientOptionsRegen(full), false);
});
