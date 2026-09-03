import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorldDirectorConfig } from "./config";

test("resolveWorldDirectorConfig: defaults to enabled=true, mode=soft, directiveInjectionEnabled=true", () => {
  const config = resolveWorldDirectorConfig();
  assert.equal(config.enabled, true, "enabled should be true by default");
  assert.equal(config.mode, "soft", "mode should be 'soft' by default");
  assert.equal(config.directiveInjectionEnabled, true, "directiveInjectionEnabled should be true in soft mode");
});

test("resolveWorldDirectorConfig: maxDueEvents defaults to 2", () => {
  const config = resolveWorldDirectorConfig();
  assert.equal(config.maxDueEvents, 2);
});
