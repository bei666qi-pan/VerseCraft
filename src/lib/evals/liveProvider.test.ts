import assert from "node:assert/strict";
import test from "node:test";

import { setManagedAiSnapshot } from "@/lib/ai/managed/state";
import { resolveLiveProviderConfig } from "./liveProvider";

test("live eval provider uses the managed background binding", () => {
  setManagedAiSnapshot(Object.freeze({
    version: 7,
    loadedAt: Date.now(),
    ready: true,
    health: "ready",
    byPurpose: Object.freeze({
      story: [], rules: [], polish: [], embedding: [],
      background: [Object.freeze({
        serviceId: "svc", serviceName: "评测服务", modelId: "judge", modelName: "judge-model",
        baseUrl: "https://eval.example/v1/chat/completions", apiKey: "managed-key",
        transport: "openai_compatible", purpose: "background", logicalRole: "reasoner",
        embeddingDimension: null, inputPriceCnyFenPerMillion: null, outputPriceCnyFenPerMillion: null,
      })],
    }),
  }));

  const config = resolveLiveProviderConfig();
  assert.equal(config.endpoint, "https://eval.example/v1/chat/completions");
  assert.equal(config.apiKey, "managed-key");
  assert.equal(config.model, "judge-model");
});
