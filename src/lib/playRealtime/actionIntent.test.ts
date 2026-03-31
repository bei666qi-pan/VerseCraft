import test from "node:test";
import assert from "node:assert/strict";
import { buildPlayerActionIntent, shapeUserActionForModelV2 } from "./actionIntent";

test("actionIntent: dialogue intent extracts target/tone and avoids long raw echo", () => {
  const raw = "我压低声音对灵伤说：别出声，我们先躲一下。";
  const intent = buildPlayerActionIntent(raw);
  assert.equal(intent.action_type, "dialogue");
  assert.equal(intent.target, "灵伤");
  assert.equal(intent.emotional_tone, "tense");
  assert.ok((intent.speech_hint ?? "").length > 0);
  assert.ok((intent.raw_snippet ?? "").length <= 18);
});

test("actionIntent: shapeUserActionForModelV2 embeds intent JSON and instruction", () => {
  const shaped = shapeUserActionForModelV2("我查看墙角的铁牌。");
  assert.ok(shaped.includes("【玩家叙事意图】"));
  assert.ok(shaped.includes("不要复述原句"));
});

