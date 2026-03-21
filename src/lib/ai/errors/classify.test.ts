// src/lib/ai/errors/classify.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyFetchThrowable,
  classifyHttpStatus,
  shouldAdvanceToNextModel,
  shouldCountTowardCircuit,
} from "@/lib/ai/errors/classify";

test("classifyHttpStatus maps status families", () => {
  assert.equal(classifyHttpStatus(429).kind, "RATE_LIMIT");
  assert.equal(classifyHttpStatus(503).kind, "UPSTREAM_5XX");
  assert.equal(classifyHttpStatus(401).kind, "HTTP_4XX_AUTH");
  assert.equal(classifyHttpStatus(418).kind, "HTTP_4XX_OTHER");
});

test("classifyFetchThrowable detects abort and network-ish errors", () => {
  const abort = new Error("aborted");
  abort.name = "AbortError";
  assert.equal(classifyFetchThrowable(abort).kind, "ABORTED");
  assert.equal(classifyFetchThrowable(new Error("fetch failed")).kind, "NETWORK");
  assert.equal(classifyFetchThrowable(new Error("timeout")).kind, "TIMEOUT");
});

test("shouldCountTowardCircuit excludes soft unknown HTTP family", () => {
  assert.equal(shouldCountTowardCircuit("UNKNOWN"), false);
  assert.equal(shouldCountTowardCircuit("UPSTREAM_5XX"), true);
});

test("shouldAdvanceToNextModel stops on client abort", () => {
  assert.equal(shouldAdvanceToNextModel("ABORTED"), false);
  assert.equal(shouldAdvanceToNextModel("RATE_LIMIT"), true);
});
