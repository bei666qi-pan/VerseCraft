import test from "node:test";
import assert from "node:assert/strict";
import { parseControlPlaneJson } from "@/lib/playRealtime/controlPlaneParse";

test("parseControlPlaneJson rejects think pollution", () => {
  const raw = `<think>chain</think>{"intent":"explore","confidence":0.9,"extracted_slots":{},"risk_tags":[],"risk_level":"low","dm_hints":"","block_dm":false,"block_reason":""}`;
  assert.equal(parseControlPlaneJson(raw), null);
});

test("parseControlPlaneJson extracts first JSON object from prose wrapper", () => {
  const raw = `好的，我将输出：\n{"intent":"dialogue","confidence":0.7,"extracted_slots":{"target":"守门人"},"risk_tags":[],"risk_level":"low","dm_hints":"保持克制","block_dm":false,"block_reason":""}\n以上。`;
  const parsed = parseControlPlaneJson(raw);
  assert.ok(parsed);
  assert.equal(parsed!.intent, "dialogue");
  assert.equal(parsed!.extracted_slots.target, "守门人");
  assert.ok(parsed!.dm_hints.length <= 120);
});

