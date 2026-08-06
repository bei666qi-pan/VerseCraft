// src/lib/observability/langfuse/privacy.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { hashIdentity, isSensitiveKey, sanitizeAttributes, hashContent } from "./privacy";
import { resetLangfuseConfig } from "./config";

function withSalt(salt: string, fn: () => void): void {
  const prev = process.env.VERSECRAFT_LANGFUSE_HASH_SALT;
  process.env.VERSECRAFT_LANGFUSE_HASH_SALT = salt;
  resetLangfuseConfig();
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env.VERSECRAFT_LANGFUSE_HASH_SALT;
    } else {
      process.env.VERSECRAFT_LANGFUSE_HASH_SALT = prev;
    }
    resetLangfuseConfig();
  }
}

test("hashIdentity returns undefined for null/undefined/empty", () => {
  withSalt("test-salt", () => {
    assert.equal(hashIdentity(null), undefined);
    assert.equal(hashIdentity(undefined), undefined);
    assert.equal(hashIdentity(""), undefined);
  });
});

test("hashIdentity produces deterministic output", () => {
  withSalt("test-salt", () => {
    const a = hashIdentity("user-123");
    const b = hashIdentity("user-123");
    assert.equal(a, b);
  });
});

test("hashIdentity changes with different salt", () => {
  let a: string | undefined;
  let b: string | undefined;
  withSalt("salt-a", () => { a = hashIdentity("user-123"); });
  withSalt("salt-b", () => { b = hashIdentity("user-123"); });
  assert.notEqual(a, b);
});

test("hashIdentity output is 32 chars hex", () => {
  withSalt("test-salt", () => {
    const h = hashIdentity("user-123");
    assert.ok(h);
    assert.equal(h.length, 32);
    assert.ok(/^[0-9a-f]{32}$/.test(h));
  });
});

test("isSensitiveKey detects api_key", () => {
  assert.equal(isSensitiveKey("api_key"), true);
  assert.equal(isSensitiveKey("API_KEY"), true);
  assert.equal(isSensitiveKey("authorization"), true);
  assert.equal(isSensitiveKey("Authorization"), true);
  assert.equal(isSensitiveKey("cookie"), true);
  assert.equal(isSensitiveKey("token"), true);
  assert.equal(isSensitiveKey("password"), true);
  assert.equal(isSensitiveKey("secret"), true);
  assert.equal(isSensitiveKey("credential"), true);
});

test("isSensitiveKey allows safe keys", () => {
  assert.equal(isSensitiveKey("requestId"), false);
  assert.equal(isSensitiveKey("model"), false);
  assert.equal(isSensitiveKey("latencyMs"), false);
  assert.equal(isSensitiveKey("task"), false);
});

test("sanitizeAttributes strips sensitive keys", () => {
  const attrs = {
    requestId: "abc",
    api_key: "secret123",
    model: "gpt-4",
    authorization: "Bearer xxx",
  };
  const safe = sanitizeAttributes(attrs);
  assert.equal(safe.requestId, "abc");
  assert.equal(safe.model, "gpt-4");
  assert.equal("api_key" in safe, false);
  assert.equal("authorization" in safe, false);
});

test("hashContent produces deterministic hash", () => {
  withSalt("test-salt", () => {
    const a = hashContent("hello world");
    const b = hashContent("hello world");
    assert.equal(a, b);
    assert.equal(a.length, 16);
  });
});
