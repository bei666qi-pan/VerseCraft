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

test("fast path: 短问句 → dialogue without canned fallback", () => {
  const r = runDeterministicControlFastPath({
    latestUserInput: "你是谁？",
    ruleSnapshot: ruleBase,
    locationHint: null,
  });
  assert.equal(r.hit, true);
  if (!r.hit) return;
  assert.equal(r.control.intent, "dialogue");
  assert.equal(r.control.extracted_slots.target, undefined);
  assert.equal(r.control.enhance_npc_emotion, true);
  assert.equal(r.reason, "dialogue_short_question");
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

test("fast-path: compound move+dialogue defers to LLM instead of misrouting as explore", () => {
  const compounds = [
    "我走向林晚枫，想和他聊聊最近发生的事。",
    "我走向前台，向管理员打听情况。",
    "走过去和陈婆婆打个招呼。",
    "我过去和林晚枫说几句话。",
  ];
  for (const input of compounds) {
    const result = runDeterministicControlFastPath({
      latestUserInput: input,
      ruleSnapshot: ruleBase,
      locationHint: null,
    });
    // Must not be fast-pathed as move_explore_explicit
    if (result.hit && result.reason === "move_explore_explicit") {
      assert.fail(`"${input}" should not be fast-pathed as move_explore_explicit`);
    }
  }
});

test("fast-path: pure move still works after dialogue compound fix", () => {
  const pureMoves = ["我走向门口", "我去B1层看看", "前往三楼", "返回房间"];
  let anyHit = false;
  for (const input of pureMoves) {
    const result = runDeterministicControlFastPath({
      latestUserInput: input,
      ruleSnapshot: ruleBase,
      locationHint: null,
    });
    if (result.hit) {
      anyHit = true;
      assert.equal(result.reason, "move_explore_explicit");
    }
  }
  assert.ok(anyHit, "At least one pure move should hit fast-path");
});

