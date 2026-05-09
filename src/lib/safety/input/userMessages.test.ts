import assert from "node:assert/strict";
import test from "node:test";
import { buildUserFacingMessage } from "./userMessages";

test("private_story_action reject returns explicit safety text without narrative fallback", () => {
  const res = buildUserFacingMessage({
    scene: "private_story_action",
    verdict: { decision: "reject" } as any,
  });
  assert.equal(res.narrativeFallback, undefined);
  assert.match(res.message, /涉黄、涉暴|违法伤害/);
});

test("private_story_action rewrite is short procedural text", () => {
  const res = buildUserFacingMessage({
    scene: "private_story_action",
    verdict: { decision: "rewrite" } as any,
  });
  assert.equal(res.narrativeFallback, undefined);
  assert.equal(res.message.includes("系统"), false);
});
