import assert from "node:assert/strict";
import test from "node:test";
import { isTestDataIdentifier, TEST_DATA_MARKER_SOURCE } from "./cleanup-test-data-policy.mjs";

test("cleanup policy recognizes every generated test/eval session prefix", () => {
  for (const value of [
    "e2e-chat-1",
    "playthrough-dark-moon-1",
    "latency-turn-1",
    "task-eval-case-1",
    "test-user-1",
    "benchmark-mock-long-context-1",
    "narrative-safety-mock-private-fact-1",
    "director-eval-case-1",
    "social-world-eval-case-1",
    "npc-consistency-eval-case-1",
    "promptfoo-case-1",
  ]) {
    assert.equal(isTestDataIdentifier(value), true, value);
  }
  assert.match("benchmark-mock-case", new RegExp(TEST_DATA_MARKER_SOURCE, "i"));
});

test("cleanup policy cannot match normal user/session identifiers", () => {
  for (const value of [
    "user-123",
    "dark-moon-session-123",
    "xingni-player-9",
    "production-benchmark-reader",
    "safety-first-player",
  ]) {
    assert.equal(isTestDataIdentifier(value), false, value);
  }
});
