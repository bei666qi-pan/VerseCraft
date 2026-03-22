import assert from "node:assert/strict";
import test from "node:test";
import { FIXED_OPENING_NARRATIVE, OPENING_SYSTEM_PROMPT } from "./openingCopy";

test("OPENING_SYSTEM_PROMPT：要求 options 为空数组，首屏选项由客户端负责", () => {
  assert.ok(OPENING_SYSTEM_PROMPT.includes("options 填空数组 []"));
  assert.ok(OPENING_SYSTEM_PROMPT.includes("客户端"));
});

test("FIXED_OPENING_NARRATIVE：非空固定开场", () => {
  assert.ok(FIXED_OPENING_NARRATIVE.length > 100);
  assert.ok(FIXED_OPENING_NARRATIVE.includes("如月公寓"));
});
