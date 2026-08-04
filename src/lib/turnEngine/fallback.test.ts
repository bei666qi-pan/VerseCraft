import test from "node:test";
import assert from "node:assert/strict";
import { isLikelyValidDMJson, sanitizeAssistantContent } from "./fallback";

test("isLikelyValidDMJson: valid DM JSON with narrative returns true", () => {
  assert.equal(
    isLikelyValidDMJson(JSON.stringify({ narrative: "test", is_action_legal: true, sanity_damage: 0, is_death: false })),
    true
  );
});

test("isLikelyValidDMJson: missing narrative key returns false", () => {
  assert.equal(isLikelyValidDMJson(JSON.stringify({ is_action_legal: true })), false);
});

test("isLikelyValidDMJson: empty string returns false", () => {
  assert.equal(isLikelyValidDMJson(""), false);
});

test("isLikelyValidDMJson: invalid JSON returns false", () => {
  assert.equal(isLikelyValidDMJson("{broken"), false);
});

test("isLikelyValidDMJson: non-string narrative returns false", () => {
  assert.equal(isLikelyValidDMJson(JSON.stringify({ narrative: 123 })), false);
});

test("sanitizeAssistantContent: valid DM JSON passes through unchanged", () => {
  const valid = JSON.stringify({ narrative: "hello", is_action_legal: true, sanity_damage: 0, is_death: false });
  assert.equal(sanitizeAssistantContent(valid), valid);
});

test("sanitizeAssistantContent: plain text wrapped into minimal DM JSON", () => {
  const result = sanitizeAssistantContent("plain text content");
  const parsed = JSON.parse(result);
  assert.equal(parsed.is_action_legal, true);
  assert.equal(parsed.sanity_damage, 0);
  assert.equal(parsed.narrative, "plain text content");
  assert.equal(parsed.is_death, false);
  assert.equal(parsed.consumes_time, true);
});

test("sanitizeAssistantContent: long text truncated to 500 chars", () => {
  const long = "x".repeat(1000);
  const result = sanitizeAssistantContent(long);
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative.length, 500);
});

test("sanitizeAssistantContent: empty string produces minimal valid DM", () => {
  const result = sanitizeAssistantContent("");
  const parsed = JSON.parse(result);
  assert.equal(parsed.narrative, "");
  assert.equal(parsed.is_action_legal, true);
});
