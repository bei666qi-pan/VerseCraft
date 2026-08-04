import assert from "node:assert/strict";
import test from "node:test";

import { resolveLiveProviderConfig } from "./liveProvider";

const DIRECT_ENV = [
  "VC_AI_DIRECT_BASE_URL",
  "VC_AI_DIRECT_API_KEY",
  "VC_AI_DIRECT_MODEL",
  "VC_AI_DIRECT_MODEL_MAIN",
  "VC_AI_DIRECT_MODEL_CONTROL",
  "VC_AI_DIRECT_MODEL_ENHANCE",
  "VC_AI_DIRECT_MODEL_REASONER",
  "AI_GATEWAY_EXTRA_BODY_JSON",
  "AI_GATEWAY_MERGE_EXTRA_BODY",
] as const;

test("live eval provider reuses codex-ds direct binding and its Pro judge lane", () => {
  const previous = new Map(DIRECT_ENV.map((key) => [key, process.env[key]]));
  const projectGatewayUrl = process.env.AI_GATEWAY_BASE_URL;
  const projectGatewayKey = process.env.AI_GATEWAY_API_KEY;
  const projectReasoner = process.env.AI_MODEL_REASONER;
  try {
    process.env.AI_GATEWAY_BASE_URL = "https://public-gateway.invalid/v1";
    process.env.AI_GATEWAY_API_KEY = "public-key";
    process.env.AI_MODEL_REASONER = "public-reasoner";
    process.env.VC_AI_DIRECT_BASE_URL = "http://127.0.0.1:4319/v1";
    process.env.VC_AI_DIRECT_API_KEY = "codex-ds-key";
    process.env.VC_AI_DIRECT_MODEL_REASONER = "deepseek-v4-pro-202606";
    process.env.AI_GATEWAY_MERGE_EXTRA_BODY = "1";
    process.env.AI_GATEWAY_EXTRA_BODY_JSON = '{"enable_thinking":true,"thinking":{"type":"enabled"}}';

    const config = resolveLiveProviderConfig();
    assert.equal(config.endpoint, "http://127.0.0.1:4319/v1/chat/completions");
    assert.equal(config.apiKey, "codex-ds-key");
    assert.equal(config.model, "deepseek-v4-pro-202606");
    assert.deepEqual(config.extraBody, { enable_thinking: true, thinking: { type: "enabled" } });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (projectGatewayUrl === undefined) delete process.env.AI_GATEWAY_BASE_URL;
    else process.env.AI_GATEWAY_BASE_URL = projectGatewayUrl;
    if (projectGatewayKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = projectGatewayKey;
    if (projectReasoner === undefined) delete process.env.AI_MODEL_REASONER;
    else process.env.AI_MODEL_REASONER = projectReasoner;
  }
});
