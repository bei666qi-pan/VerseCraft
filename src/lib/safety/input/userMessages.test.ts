import assert from "node:assert/strict";
import test from "node:test";
import { buildUserFacingMessage } from "./userMessages";
import { NARRATIVE_GUARD_IMMERSIVE_FALLBACK } from "@/lib/security/policy";

test("private_story_action reject：回退提示不是本地剧情模板", () => {
  const res = buildUserFacingMessage({
    scene: "private_story_action",
    verdict: { decision: "reject" } as any,
  });
  assert.ok(res.narrativeFallback, "应提供 narrativeFallback");
  assert.equal(res.narrativeFallback, NARRATIVE_GUARD_IMMERSIVE_FALLBACK);
  assert.equal(String(res.narrativeFallback).includes("当前行动"), false);
  assert.equal(String(res.narrativeFallback).includes("我收回念头"), false);
  assert.equal(String(res.narrativeFallback).includes("叙事边界"), false);
});
