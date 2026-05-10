import assert from "node:assert/strict";
import test from "node:test";
import { buildStablePlayerDmSystemLines } from "./playerChatSystemPrompt";

test("stable prompt contains 5 profession names", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  const professions = ["守灯人", "巡迹客", "觅兆者", "齐日角", "溯源师"];
  for (const p of professions) {
    assert.ok(text.includes(p), `should include profession: ${p}`);
  }
});

test("stable prompt contains B1 forging guidance with N-008", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  assert.ok(text.includes("B1_PowerRoom"), "should reference B1_PowerRoom");
  assert.ok(text.includes("N-008"), "should reference N-008 as forging provider");
  assert.ok(text.includes("锻造"), "should mention forging");
});

test("stable prompt forbids fabricating professions", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  assert.ok(text.includes("禁止生造其它职业名"), "should forbid fabricating profession names");
});
