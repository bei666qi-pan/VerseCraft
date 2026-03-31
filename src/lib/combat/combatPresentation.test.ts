import test from "node:test";
import assert from "node:assert/strict";
import { buildNpcCombatPowerDisplay, dangerTierToPlayerText, styleTagsToPlayerHint } from "./combatPresentation";

test("buildNpcCombatPowerDisplay: 不包含数字", () => {
  const s = buildNpcCombatPowerDisplay({ dangerText: dangerTierToPlayerText("high"), styleHint: "守线与卡位" });
  assert.ok(!/\d/.test(s));
  assert.ok(s.includes("危险"));
});

test("styleTagsToPlayerHint: 输出短提示且不含数字", () => {
  const s = styleTagsToPlayerHint(["boundary_guard", "close_quarters"]);
  assert.ok(s.includes("守线") || s.includes("近身"));
  assert.ok(!/\d/.test(s));
});

