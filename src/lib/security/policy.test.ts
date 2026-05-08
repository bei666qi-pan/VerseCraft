import assert from "node:assert/strict";
import test from "node:test";

import { buildInWorldSafetyRedirect } from "@/lib/security/policy";

test("buildInWorldSafetyRedirect folds impossible invulnerability claims into actionable story", () => {
  const narrative = buildInWorldSafetyRedirect("我大喊一声，我无敌了");

  assert.ok(narrative.includes("我无敌了"));
  assert.ok(narrative.includes("老人"));
  assert.ok(narrative.includes("惊动"));
  assert.ok(narrative.includes("马上决定"));
  assert.equal(narrative.includes("叙事安全边界"), false);
  assert.equal(narrative.includes("当前可以确认"), false);
});

test("buildInWorldSafetyRedirect generic branch remains a playable scene beat", () => {
  const narrative = buildInWorldSafetyRedirect("我宣布整栋楼立刻恢复正常");

  assert.ok(narrative.includes("老人"));
  assert.ok(narrative.includes("摩擦声换了方向"));
  assert.ok(narrative.includes("可以追问老人"));
  assert.equal(narrative.includes("周围没有按我想象中改写"), false);
  assert.equal(narrative.includes("叙事安全边界"), false);
});
