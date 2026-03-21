import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FOUR_ACTION_OPTIONS } from "@/features/play/opening/openingCopy";

test("DEFAULT_FOUR_ACTION_OPTIONS 长度为 4，供开局降级注入", () => {
  assert.equal(DEFAULT_FOUR_ACTION_OPTIONS.length, 4);
  assert.ok(DEFAULT_FOUR_ACTION_OPTIONS.every((s) => typeof s === "string" && s.trim().length > 0));
});
