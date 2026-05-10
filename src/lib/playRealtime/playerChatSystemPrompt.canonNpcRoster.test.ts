import assert from "node:assert/strict";
import test from "node:test";
import { buildStablePlayerDmSystemLines } from "./playerChatSystemPrompt";

test("stable prompt contains canonical NPC roster with N-015=麟泽", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  assert.ok(text.includes("麟泽"), "should include 麟泽");
  assert.ok(text.includes("N-015"), "should include N-015");
});

test("stable prompt contains anti-fabrication rule", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  assert.ok(text.includes("禁止生造别名"), "should contain anti-alias fabrication rule");
});

test("stable prompt contains canonical names for core NPCs", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  const expected = ["陈婆婆", "电工老刘", "欣蓝", "麟泽", "洗衣房阿姨"];
  for (const name of expected) {
    assert.ok(text.includes(name), `should include ${name}`);
  }
});
