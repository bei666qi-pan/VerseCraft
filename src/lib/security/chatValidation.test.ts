import test from "node:test";
import assert from "node:assert/strict";
import { validateChatRequest } from "@/lib/security/chatValidation";

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

