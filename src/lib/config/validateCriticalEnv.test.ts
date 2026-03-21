// src/lib/config/validateCriticalEnv.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  EnvValidationError,
  normalizeDatabaseUrl,
  validateAuthSecretLength,
  validatePostgresDatabaseUrl,
} from "@/lib/config/validateCriticalEnv";

test("normalizeDatabaseUrl strips wrapping quotes", () => {
  assert.equal(normalizeDatabaseUrl(`"postgresql://x"`), "postgresql://x");
  assert.equal(normalizeDatabaseUrl(`'postgresql://y'`), "postgresql://y");
});

test("validatePostgresDatabaseUrl accepts postgres and postgresql schemes", () => {
  assert.doesNotThrow(() => validatePostgresDatabaseUrl("postgresql://localhost/db"));
  assert.doesNotThrow(() => validatePostgresDatabaseUrl("postgres://localhost/db"));
});

test("validatePostgresDatabaseUrl rejects non-postgres URLs", () => {
  assert.throws(
    () => validatePostgresDatabaseUrl("mysql://x"),
    (e: unknown) => e instanceof EnvValidationError
  );
});

test("validateAuthSecretLength enforces minimum length", () => {
  assert.throws(
    () => validateAuthSecretLength("short"),
    (e: unknown) => e instanceof EnvValidationError
  );
  assert.doesNotThrow(() => validateAuthSecretLength("sixteen_chars_ok"));
});
