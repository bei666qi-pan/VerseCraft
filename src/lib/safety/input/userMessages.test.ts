import assert from "node:assert/strict";
import test from "node:test";
import { buildUserFacingMessage } from "./userMessages";

test("private_story_action reject：回退叙事不包含已移除句子", () => {
  const res = buildUserFacingMessage({
    scene: "private_story_action",
    verdict: { decision: "reject" } as any,
  });
  assert.ok(res.narrativeFallback, "应提供 narrativeFallback");
  assert.ok(
    !String(res.narrativeFallback).includes("你意识到这条行动的走向过于危险或不合适，选择收回念头，重新审视周围的线索。")
  );
});

