import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStorageFallbackValue } from "@/lib/resilientStorage";

test("resolveStorageFallbackValue accepts string IDB value", () => {
  assert.equal(resolveStorageFallbackValue("idb", "local", "memory"), "idb");
});

test("resolveStorageFallbackValue falls back from non-string IDB value to localStorage", () => {
  assert.equal(resolveStorageFallbackValue({ broken: true }, "local", "memory"), "local");
});

test("resolveStorageFallbackValue falls back to memory cache and rejects non-strings", () => {
  assert.equal(resolveStorageFallbackValue(42, null, "memory"), "memory");
  assert.equal(resolveStorageFallbackValue(42, null, undefined), null);
});
