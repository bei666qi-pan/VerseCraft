import assert from "node:assert/strict";
import test from "node:test";

import { buildInWorldSafetyRedirect } from "@/lib/security/policy";

test("buildInWorldSafetyRedirect no longer emits canned story for invulnerability claims", () => {
  const narrative = buildInWorldSafetyRedirect("我大喊一声，我无敌了");

  assert.ok(narrative.includes("无法由玩家直接声明成立"));
  assert.equal(narrative.includes("老人"), false);
  assert.equal(narrative.includes("摩擦声"), false);
  assert.equal(narrative.includes("我无敌了"), false);
});

test("buildInWorldSafetyRedirect generic branch is a non-story retry prompt", () => {
  const narrative = buildInWorldSafetyRedirect("我宣布整栋楼立刻恢复正常");

  assert.ok(narrative.includes("当前行动无法按原描述执行"));
  assert.equal(narrative.includes("老人没有接我的话"), false);
  assert.equal(narrative.includes("老人"), false);
  assert.equal(narrative.includes("摩擦声"), false);
});
