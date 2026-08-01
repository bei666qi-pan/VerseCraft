/**
 * Regression test: empty input rejection
 * Fix: chatValidation.ts rejects empty/whitespace-only input at multiple levels
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateChatRequest } from "./chatValidation";

describe("Empty Input Rejection (Regression)", () => {
  it("rejects empty string message content", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "" }],
      sessionId: "test-session",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it("rejects whitespace-only message content", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "   \n  \t  " }],
      sessionId: "test-session",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it("rejects a confirmation-only message with no player action", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "（再次确认）" }],
      sessionId: "test-session",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });

  it("accepts normal input", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "我环顾四周" }],
      sessionId: "test-session",
    });
    assert.equal(result.ok, true);
  });

  it("accepts input with leading/trailing whitespace", () => {
    const result = validateChatRequest({
      messages: [{ role: "user", content: "  你好  " }],
      sessionId: "test-session",
    });
    assert.equal(result.ok, true);
  });

  it("rejects message array where last user message is empty after valid messages", () => {
    const result = validateChatRequest({
      messages: [
        { role: "user", content: "之前说过的话" },
        { role: "assistant", content: "回复" },
        { role: "user", content: "" },
      ],
      sessionId: "test-session",
    });
    assert.equal(result.ok, false);
  });

  it("rejects message array where last user message is whitespace only", () => {
    const result = validateChatRequest({
      messages: [
        { role: "user", content: "之前说过的话" },
        { role: "user", content: "   " },
      ],
      sessionId: "test-session",
    });
    assert.equal(result.ok, false);
  });
});
