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

// ═══ Regression: Gap 2 — rewriteNpcNameAliases edge cases ═══

test("rewriteNpcNameAliases: alias at absolute end of narrative is rewritten", () => {
  // The endsWith fallback (line 110-113) handles this correctly.
  const narrative = "你看着小陈";
  const result = rewriteNpcNameAliases(narrative, [
    { suspectedAlias: "小陈", possibleCanonName: "麟泽", npcId: "N-015" },
  ]);
  assert.equal(result.rewrites, 1);
  assert.ok(result.narrative.endsWith("麟泽"), "should end with canonical name");
  assert.ok(!result.narrative.includes("小陈"), "should not contain fabricated alias");
});

test("rewriteNpcNameAliases: alias at start of narrative followed by verb is rewritten", () => {
  const narrative = "小陈说，这里不安全。";
  const result = rewriteNpcNameAliases(narrative, [
    { suspectedAlias: "小陈", possibleCanonName: "麟泽", npcId: "N-015" },
  ]);
  assert.equal(result.rewrites, 1);
  assert.ok(result.narrative.startsWith("麟泽"), "should start with canonical name");
});

test("rewriteNpcNameAliases: alias before sentence-ending punctuation is rewritten", () => {
  // The lookahead includes 。，、！？：；…— so this case is handled correctly.
  const narrative = "麟泽刚走，小陈。你说呢？";
  const result = rewriteNpcNameAliases(narrative, [
    { suspectedAlias: "小陈", possibleCanonName: "麟泽", npcId: "N-015" },
  ]);
  assert.equal(result.rewrites, 1);
  assert.ok(result.narrative.includes("麟泽。"), "alias before period should be rewritten");
  assert.ok(!result.narrative.includes("小陈"), "should not contain fabricated alias");
});

test("rewriteNpcNameAliases: alias before newline is NOT rewritten (known gap)", () => {
  // The lookahead regex (line 98-101) does not include \n, so alias at end of
  // a paragraph followed by a newline is silently skipped.
  const narrative = "麟泽站在门口。\n小陈\n下一段开始了。";
  const result = rewriteNpcNameAliases(narrative, [
    { suspectedAlias: "小陈", possibleCanonName: "麟泽", npcId: "N-015" },
  ]);
  // Known limitation: \n is not in the lookahead character set.
  assert.ok(result.narrative.includes("\n小陈\n"), "alias before newline is NOT rewritten (known gap)");
  assert.equal(result.rewrites, 0);
});

test("rewriteNpcNameAliases: alias before closing Chinese quote is NOT rewritten (known gap)", () => {
  // The lookahead does not include 」or 』, so "小陈」" is not matched even though
  // the next character "道" is in the lookahead — the alias must be IMMEDIATELY
  // followed by a listed character, not separated by a quote mark.
  const narrative = "「小陈」道，这里很危险。";
  const result = rewriteNpcNameAliases(narrative, [
    { suspectedAlias: "小陈", possibleCanonName: "麟泽", npcId: "N-015" },
  ]);
  assert.ok(result.narrative.includes("小陈」"), "alias before closing quote is NOT rewritten (known gap)");
  assert.equal(result.rewrites, 0);
});

test("rewriteNpcNameAliases: alias followed by comma in dialogue is rewritten", () => {
  // Commas in the lookahead (，) should match.
  const narrative = "小陈，你来一下。";
  const result = rewriteNpcNameAliases(narrative, [
    { suspectedAlias: "小陈", possibleCanonName: "麟泽", npcId: "N-015" },
  ]);
  assert.equal(result.rewrites, 1);
  assert.ok(result.narrative.startsWith("麟泽，"), "alias before comma should be rewritten");
});
