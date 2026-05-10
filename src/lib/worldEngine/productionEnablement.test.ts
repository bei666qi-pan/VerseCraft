import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorldDirectorConfig } from "./config";

test("resolveWorldDirectorConfig: defaults to enabled=true, mode=soft, hintInjectionEnabled=true", () => {
  const config = resolveWorldDirectorConfig();
  assert.equal(config.enabled, true, "enabled should be true by default");
  assert.equal(config.mode, "soft", "mode should be 'soft' by default");
  assert.equal(config.hintInjectionEnabled, true, "hintInjectionEnabled should be true in soft mode");
});

test("resolveWorldDirectorConfig: maxDueHints defaults to 2", () => {
  const config = resolveWorldDirectorConfig();
  assert.equal(config.maxDueHints, 2);
});

test("resolveWorldDirectorConfig: criticEnabled defaults to false", () => {
  const config = resolveWorldDirectorConfig();
  assert.equal(config.criticEnabled, false);
});
