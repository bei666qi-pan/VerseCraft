import test from "node:test";
import assert from "node:assert/strict";
import { moderationTextForPrivateStoryChat, validateChatRequest } from "@/lib/security/chatValidation";

test("validateChatRequest: openingOptionsOnlyRound defaults to false", () => {
  const v = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    sessionId: "s",
    clientState: null,
  });
  assert.ok(v.ok);
  assert.equal(v.openingOptionsOnlyRound, false);
});

test("validateChatRequest: openingOptionsOnlyRound accepts true", () => {
  const v = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    sessionId: "s",
    clientState: null,
    openingOptionsOnlyRound: true,
  });
  assert.ok(v.ok);
  assert.equal(v.openingOptionsOnlyRound, true);
});

test("validateChatRequest: clientPurpose defaults to normal", () => {
  const v = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    sessionId: "s",
    clientState: null,
  });
  assert.ok(v.ok);
  assert.equal(v.clientPurpose, "normal");
});

test("validateChatRequest: clientPurpose accepts options_regen_only", () => {
  const v = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    sessionId: "s",
    clientState: null,
    clientPurpose: "options_regen_only",
  });
  assert.ok(v.ok);
  assert.equal(v.clientPurpose, "options_regen_only");
});

test("moderationTextForPrivateStoryChat：options_regen_only 使用固定短句，不送审整段模板", () => {
  const long = "死亡 道具 抹杀 OPTIONS_REGEN 协议说明";
  assert.equal(
    moderationTextForPrivateStoryChat("options_regen_only", long),
    "刷新可选行动"
  );
});

test("moderationTextForPrivateStoryChat：normal 沿用 latestUserInput", () => {
  assert.equal(moderationTextForPrivateStoryChat("normal", "玩家输入"), "玩家输入");
});

