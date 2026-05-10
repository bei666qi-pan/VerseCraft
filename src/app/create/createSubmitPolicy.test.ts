import test from "node:test";
import assert from "node:assert/strict";
import { validateCreateProfileBeforeLocalStart } from "./createSubmitPolicy";

test("create submit policy allows normal profile text before local start", () => {
  assert.deepEqual(validateCreateProfileBeforeLocalStart({ name: "黎川", personality: "冷静" }), { ok: true });
});

test("create submit policy blocks clear visible safety profile text", () => {
  const decision = validateCreateProfileBeforeLocalStart({ name: "血腥暴力", personality: "冷静" });
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.reason, "visible_safety");
    assert.match(decision.message, /涉黄、涉暴或违法伤害/);
  }
});
