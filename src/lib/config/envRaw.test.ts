// src/lib/config/envRaw.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { envRaw } from "@/lib/config/envRaw";

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) {
    prev[k] = process.env[k];
    const v = patch[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(patch)) {
      const old = prev[k];
      if (old === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = old;
      }
    }
  }
}

test("envRaw strips wrapping quotes", () => {
  withEnv({ VC_TEST_STRIP: '"inner-value"' }, () => {
    assert.equal(envRaw("VC_TEST_STRIP"), "inner-value");
  });
  withEnv({ VC_TEST_STRIP: "'single'" }, () => {
    assert.equal(envRaw("VC_TEST_STRIP"), "single");
  });
});
