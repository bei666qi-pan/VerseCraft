import test from "node:test";
import assert from "node:assert/strict";
import { setManagedAiSnapshot, getManagedBindingsForTask, managedAiConfiguredForTask } from "./state";
import type { ManagedAiSnapshot } from "./types";

function snapshot(version: number, ids: string[]): ManagedAiSnapshot {
  const story = ids.map((modelId, priority) => Object.freeze({ serviceId: `s${priority}`, serviceName: `服务${priority}`, modelId, modelName: modelId, baseUrl: "https://example.com/v1/chat/completions", apiKey: "secret", transport: "openai_compatible" as const, purpose: "story" as const, logicalRole: "writer" as const, embeddingDimension: null, inputPriceCnyFenPerMillion: null, outputPriceCnyFenPerMillion: null }));
  return Object.freeze({ version, loadedAt: Date.now(), ready: true, health: "ready", byPurpose: Object.freeze({ story, rules: [], polish: [], background: [], embedding: [] }) });
}

test("managed snapshot preserves configured priority and swaps atomically", () => {
  setManagedAiSnapshot(snapshot(1, ["primary", "fallback"]));
  const inFlight = getManagedBindingsForTask("PLAYER_CHAT");
  assert.deepEqual(inFlight.map((b) => b.modelId), ["primary", "fallback"]);
  setManagedAiSnapshot(snapshot(2, ["replacement"]));
  assert.deepEqual(getManagedBindingsForTask("PLAYER_CHAT").map((b) => b.modelId), ["replacement"]);
  assert.deepEqual(inFlight.map((b) => b.modelId), ["primary", "fallback"]);
});

test("managed provider readiness defaults to the player story route", () => {
  setManagedAiSnapshot(snapshot(3, ["story-model"]));
  assert.equal(managedAiConfiguredForTask(), true);
  assert.deepEqual(getManagedBindingsForTask().map((binding) => binding.modelId), ["story-model"]);
});
