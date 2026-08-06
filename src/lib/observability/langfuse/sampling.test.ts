// src/lib/observability/langfuse/sampling.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { shouldSample } from "./sampling";
import { resetLangfuseConfig } from "./config";

function withConfig(env: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    const v = env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  resetLangfuseConfig();
  try {
    fn();
  } finally {
    for (const k of Object.keys(env)) {
      const old = prev[k];
      if (old === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = old;
      }
    }
    resetLangfuseConfig();
  }
}

test("shouldSample: always true at 100% rate", () => {
  withConfig({
    VERSECRAFT_ENABLE_LANGFUSE: "1",
    VERSECRAFT_LANGFUSE_SAMPLE_RATE: "1",
  }, () => {
    // Test many requestIds to ensure all are sampled
    for (let i = 0; i < 100; i++) {
      assert.equal(shouldSample(`req-${i}`), true);
    }
  });
});

test("shouldSample: always false at 0% rate", () => {
  withConfig({
    VERSECRAFT_ENABLE_LANGFUSE: "1",
    VERSECRAFT_LANGFUSE_SAMPLE_RATE: "0",
  }, () => {
    for (let i = 0; i < 100; i++) {
      assert.equal(shouldSample(`req-${i}`), false);
    }
  });
});

test("shouldSample: deterministic for same requestId", () => {
  withConfig({
    VERSECRAFT_ENABLE_LANGFUSE: "1",
    VERSECRAFT_LANGFUSE_SAMPLE_RATE: "0.5",
  }, () => {
    const reqId = "req-deterministic-test";
    const first = shouldSample(reqId);
    const second = shouldSample(reqId);
    assert.equal(first, second);
  });
});

test("shouldSample: approximately matches rate at 50%", () => {
  withConfig({
    VERSECRAFT_ENABLE_LANGFUSE: "1",
    VERSECRAFT_LANGFUSE_SAMPLE_RATE: "0.5",
  }, () => {
    let sampled = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      if (shouldSample(`req-${i}`)) sampled++;
    }
    // Allow ±10% tolerance at 1000 samples
    const rate = sampled / n;
    assert.ok(rate > 0.4 && rate < 0.6, `Expected ~0.5, got ${rate}`);
  });
});

test("shouldSample: approximately matches rate at 10%", () => {
  withConfig({
    VERSECRAFT_ENABLE_LANGFUSE: "1",
    VERSECRAFT_LANGFUSE_SAMPLE_RATE: "0.1",
  }, () => {
    let sampled = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      if (shouldSample(`req-${i}`)) sampled++;
    }
    const rate = sampled / n;
    assert.ok(rate > 0.05 && rate < 0.15, `Expected ~0.1, got ${rate}`);
  });
});
