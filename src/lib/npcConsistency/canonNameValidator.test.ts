import assert from "node:assert/strict";
import test from "node:test";
import { validateCanonNames } from "./canonNameValidator";

test("canonNameValidator: detects alias for single scene NPC", () => {
  const warnings = validateCanonNames(
    "小陈点了点头，示意你可以过去。",
    ["N-015"]
  );
  assert.ok(warnings.length > 0, "should produce at least one warning");
  assert.equal(warnings[0]!.possibleCanonName, "麟泽");
  assert.equal(warnings[0]!.npcId, "N-015");
});

test("canonNameValidator: no warning when canonical name is used", () => {
  const warnings = validateCanonNames(
    "麟泽沉默地站在那里，注视着远方。",
    ["N-015"]
  );
  assert.equal(warnings.length, 0);
});

test("canonNameValidator: no warning for empty narrative", () => {
  const warnings = validateCanonNames("", ["N-015"]);
  assert.equal(warnings.length, 0);
});

test("canonNameValidator: no warning when canonical name already present", () => {
  const warnings = validateCanonNames(
    "麟泽和小陈聊了起来。",
    ["N-015"]
  );
  assert.equal(warnings.length, 0, "no warning because canonical name 麟泽 is in the narrative");
});
