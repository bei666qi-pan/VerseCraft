import test from "node:test";
import assert from "node:assert/strict";
import { runDeterministicControlFastPath } from "@/lib/playRealtime/controlFastPath";

const ruleBase = {
  in_combat_hint: false,
  in_dialogue_hint: false,
  location_changed_hint: false,
  high_value_scene: false,
};

test("fast path: 明确移动/探索 → explore + location_hint", () => {
  const r = runDeterministicControlFastPath({
    latestUserInput: "我去钟楼",
    ruleSnapshot: ruleBase,
    locationHint: null,
  });
  assert.equal(r.hit, true);
  if (!r.hit) return;
  assert.equal(r.control.intent, "explore");
  assert.ok(r.control.confidence >= 0.85);
  assert.equal(r.control.extracted_slots.location_hint, "钟楼");
});

test("fast path: 明确对话 → dialogue + target", () => {
  const r = runDeterministicControlFastPath({
    latestUserInput: "我对守门人说：我想进去",
    ruleSnapshot: ruleBase,
    locationHint: null,
  });
  assert.equal(r.hit, true);
  if (!r.hit) return;
  assert.equal(r.control.intent, "dialogue");
  assert.ok(r.control.extracted_slots.target);
});

test("fast path: 明确道具使用 → use_item + item_hint", () => {
  const r = runDeterministicControlFastPath({
    latestUserInput: "我使用了道具：【止血绷带】",
    ruleSnapshot: ruleBase,
    locationHint: null,
  });
  assert.equal(r.hit, true);
  if (!r.hit) return;
  assert.equal(r.control.intent, "use_item");
  assert.equal(r.control.extracted_slots.item_hint, "止血绷带");
});

test("fast path: 元操作 → meta", () => {
  const r = runDeterministicControlFastPath({
    latestUserInput: "保存",
    ruleSnapshot: ruleBase,
    locationHint: null,
  });
  assert.equal(r.hit, true);
  if (!r.hit) return;
  assert.equal(r.control.intent, "meta");
});

test("fast path: 模糊长输入不命中（交给 LLM）", () => {
  const r = runDeterministicControlFastPath({
    latestUserInput: "我看着他的眼睛，试图从沉默里读出这座城的规则，然后决定先不动手。",
    ruleSnapshot: ruleBase,
    locationHint: null,
  });
  assert.equal(r.hit, false);
});

