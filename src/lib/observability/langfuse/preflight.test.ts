import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLangfusePreflight } from "./preflight";
import type { LangfuseConfig } from "./types";

function config(overrides: Partial<LangfuseConfig> = {}): LangfuseConfig {
  return {
    enabled: true,
    publicKey: "pk-test",
    secretKey: "sk-test",
    baseUrl: "https://cloud.langfuse.com",
    environment: "test",
    sampleRate: 1,
    captureContent: false,
    promptSource: "local",
    flushTimeoutMs: 5000,
    hashSalt: "private-test-salt",
    ...overrides,
  };
}

test("langfuse preflight reports disabled without exposing credentials", () => {
  const result = evaluateLangfusePreflight(config({ enabled: false }));
  assert.equal(result.state, "disabled");
  assert.equal(JSON.stringify(result).includes("sk-test"), false);
});

test("langfuse preflight reports missing keys and zero sampling", () => {
  const result = evaluateLangfusePreflight(config({ publicKey: undefined, secretKey: undefined, sampleRate: 0 }));
  assert.equal(result.state, "misconfigured");
  assert.equal(result.issues.length, 3);
});

test("langfuse preflight rejects default production hash salt", () => {
  const result = evaluateLangfusePreflight(config({ hashSalt: "versecraft-langfuse-default" }), "production");
  assert.equal(result.ready, false);
  assert.match(result.issues.join(" "), /HASH_SALT/);
});

test("langfuse preflight accepts complete configuration", () => {
  const result = evaluateLangfusePreflight(config(), "production");
  assert.equal(result.state, "ready");
  assert.equal(result.ready, true);
});
