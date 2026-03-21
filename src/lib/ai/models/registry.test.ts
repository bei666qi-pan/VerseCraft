// src/lib/ai/models/registry.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_MODEL_IDS,
  assertAllowedModel,
  getRegisteredModel,
  listAllowedModels,
  normalizeAllowedModelId,
} from "@/lib/ai/models/registry";

test("ALLOWED_MODEL_IDS is exactly four logical models", () => {
  assert.deepEqual(
    [...ALLOWED_MODEL_IDS].sort(),
    [
      "MiniMax-M2.7-highspeed",
      "deepseek-reasoner",
      "deepseek-v3.2",
      "glm-5-air",
    ].sort()
  );
});

test("normalizeAllowedModelId maps aliases and rejects unknown", () => {
  assert.equal(normalizeAllowedModelId("DeepSeek-V3.2"), "deepseek-v3.2");
  assert.equal(normalizeAllowedModelId("deepseek-v3.2-chat"), "deepseek-v3.2");
  assert.equal(normalizeAllowedModelId("glm-5-air"), "glm-5-air");
  assert.equal(normalizeAllowedModelId("gpt-4"), null);
  assert.equal(normalizeAllowedModelId(""), null);
  assert.equal(normalizeAllowedModelId(undefined), null);
});

test("offlineOnly: reasoner offline, v32 online", () => {
  assert.equal(getRegisteredModel("deepseek-reasoner").offlineOnly, true);
  assert.equal(getRegisteredModel("deepseek-v3.2").offlineOnly, false);
  assert.equal(getRegisteredModel("MiniMax-M2.7-highspeed").offlineOnly, false);
});

test("assertAllowedModel throws for non-whitelist id", () => {
  assert.throws(() => assertAllowedModel("gpt-5"));
});

test("listAllowedModels returns one entry per whitelist id", () => {
  assert.equal(listAllowedModels().length, ALLOWED_MODEL_IDS.length);
});
