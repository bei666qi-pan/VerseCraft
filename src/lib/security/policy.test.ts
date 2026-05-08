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
