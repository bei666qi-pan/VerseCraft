import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXED_OPENING_NARRATIVE,
  isOpeningSystemUserMessage,
  OPENING_SYSTEM_PROMPT,
} from "./openingCopy";

test("OPENING_SYSTEM_PROMPT：要求主笔产出非空四条 options，与固定前文协议一致", () => {
  assert.ok(OPENING_SYSTEM_PROMPT.includes("禁止输出空数组"));
  assert.ok(OPENING_SYSTEM_PROMPT.includes("恰好 4 条") || OPENING_SYSTEM_PROMPT.includes("必须恰好 4 条"));
  assert.ok(!OPENING_SYSTEM_PROMPT.includes("options 填空数组 []"));
});

test("isOpeningSystemUserMessage：trim 后与 OPENING_SYSTEM_PROMPT 对齐", () => {
  assert.equal(isOpeningSystemUserMessage(`  ${OPENING_SYSTEM_PROMPT}  `), true);
  assert.equal(isOpeningSystemUserMessage("玩家行动：观察"), false);
});

test("FIXED_OPENING_NARRATIVE：非空固定开场", () => {
  assert.ok(FIXED_OPENING_NARRATIVE.length > 100);
  assert.ok(FIXED_OPENING_NARRATIVE.includes("如月公寓"));
});
