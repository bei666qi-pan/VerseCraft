import assert from "node:assert/strict";
import test from "node:test";
import { formatCompactLocationLabel, formatLocationLabel } from "./locationLabels";

test("formats compact mobile location labels without exposing raw ids", () => {
  assert.equal(formatCompactLocationLabel("B1_SafeZone"), "B1 安全中枢");
  assert.equal(formatCompactLocationLabel("missing_location"), "未知区域");
});

test("keeps full location labels available for existing settings UI", () => {
  assert.equal(formatLocationLabel("B1_SafeZone"), "地下一层安全区");
  assert.equal(formatLocationLabel(""), "未知区域");
});
