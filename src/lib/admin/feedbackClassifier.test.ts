import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NEGATIVE_WORDS, hasUnnegatedKeyword, isNegativeFeedbackText } from "@/lib/admin/feedbackClassifier";

test("hasUnnegatedKeyword finds a plain (non-negated) occurrence", () => {
  assert.equal(hasUnnegatedKeyword("这个游戏卡出翔了", "卡"), true);
});

test("hasUnnegatedKeyword ignores an occurrence directly negated by 不/没/没有", () => {
  assert.equal(hasUnnegatedKeyword("很好，不卡", "卡"), false);
  assert.equal(hasUnnegatedKeyword("体验没问题", "问题"), false);
  assert.equal(hasUnnegatedKeyword("这次更新没有崩溃", "崩"), false);
  assert.equal(hasUnnegatedKeyword("画面不差", "差"), false);
});

test("hasUnnegatedKeyword still reports true when at least one occurrence is unnegated", () => {
  // 第一次"卡"被"不"否定，第二次"卡"是真实抱怨。
  assert.equal(hasUnnegatedKeyword("虽然登录不卡，但战斗卡成PPT", "卡"), true);
});

test("hasUnnegatedKeyword returns false when the keyword never appears", () => {
  assert.equal(hasUnnegatedKeyword("剧情很棒", "卡"), false);
});

test("isNegativeFeedbackText: the exact regression case from the admin audit", () => {
  // 原始 bug：`text.includes(word)` 会把这句误判为负向反馈。
  assert.equal(isNegativeFeedbackText("很好，不卡".toLowerCase()), false);
});

test("isNegativeFeedbackText still flags real complaints", () => {
  assert.equal(isNegativeFeedbackText("剧情崩了，体验很差".toLowerCase()), true);
  assert.equal(isNegativeFeedbackText("经常卡顿，加载慢".toLowerCase()), true);
});

test("DEFAULT_NEGATIVE_WORDS is non-empty and used by isNegativeFeedbackText by default", () => {
  assert.ok(DEFAULT_NEGATIVE_WORDS.length > 0);
  assert.equal(isNegativeFeedbackText("一切正常", []), false);
});
