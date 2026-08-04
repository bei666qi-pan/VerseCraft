import assert from "node:assert/strict";
import test from "node:test";
import { rewriteNpcNameAliases, validateCanonNames } from "./canonNameValidator";

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

// --- rewriteNpcNameAliases tests ---

test("rewriteNpcNameAliases: replaces fabricated alias with canonical name", () => {
  const narrative = "小陈点了点头，示意你可以过去。";
  const warnings = validateCanonNames(narrative, ["N-015"]);
  const result = rewriteNpcNameAliases(narrative, warnings);
  assert.equal(result.rewrites, 1);
  assert.ok(result.narrative.includes("麟泽"), "should contain canonical name");
  assert.ok(!result.narrative.includes("小陈"), "should not contain fabricated alias");
});

test("rewriteNpcNameAliases: no-op when no warnings", () => {
  const narrative = "麟泽站在那里。";
  const result = rewriteNpcNameAliases(narrative, []);
  assert.equal(result.rewrites, 0);
  assert.equal(result.narrative, narrative);
});

test("rewriteNpcNameAliases: does not replace alias within words", () => {
  // "小" followed by non-name context should not be replaced
  const narrative = "小明走进了小房间。麟泽也在。";
  const warnings = [{ suspectedAlias: "小明", possibleCanonName: "麟泽", npcId: "N-015" }];
  const result = rewriteNpcNameAliases(narrative, warnings);
  // "小明" followed by "走" → should be replaced
  assert.ok(result.narrative.includes("麟泽走"), "alias before verb should be replaced");
});

test("rewriteNpcNameAliases: handles empty narrative", () => {
  const result = rewriteNpcNameAliases("", [
    { suspectedAlias: "小陈", possibleCanonName: "麟泽", npcId: "N-015" },
  ]);
  assert.equal(result.rewrites, 0);
});

test("rewriteNpcNameAliases: handles multiple aliases", () => {
  const narrative = "小石说：这里不安全。老李点了点头。";
  const warnings = [
    { suspectedAlias: "小石", possibleCanonName: "麟泽", npcId: "N-015" },
    { suspectedAlias: "老李", possibleCanonName: "麟泽", npcId: "N-015" },
  ];
  const result = rewriteNpcNameAliases(narrative, warnings);
  assert.equal(result.rewrites, 2);
  assert.ok(!result.narrative.includes("小石"));
  assert.ok(!result.narrative.includes("老李"));
});
