import test from "node:test";
import assert from "node:assert/strict";
import { replaceInternalNpcIdsForDisplay } from "./playerFacingText";

test("replaceInternalNpcIdsForDisplay：N-001 → 显示名", () => {
  const { text, replaced } = replaceInternalNpcIdsForDisplay("去找 N-001 谈谈");
  assert.ok(replaced >= 1);
  assert.ok(!text.includes("N-001"));
  assert.ok(text.includes("陈") || text.includes("婆婆"));
});
