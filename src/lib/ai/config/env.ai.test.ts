// src/lib/ai/config/env.ai.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { anyAiProviderConfigured, DEFAULT_PLAYER_CHAIN, resolveAiEnv } from "@/lib/ai/config/envCore";
import { resolveOperationMode } from "@/lib/ai/degrade/modeCore";

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) {
    prev[k] = process.env[k];
    const v = patch[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(patch)) {
      const old = prev[k];
      if (old === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = old;
      }
    }
  }
}

test("resolveAiEnv parses AI_PLAYER_MODEL_CHAIN and drops unknown ids", () => {
  withEnv(
    {
      DEEPSEEK_API_KEY: "a",
      ZHIPU_API_KEY: "b",
      AI_PLAYER_MODEL_CHAIN: "glm-5-air,deepseek-v3.2,gpt-4",
    },
    () => {
      const e = resolveAiEnv();
      assert.deepEqual(e.playerChatFallbackChain, ["glm-5-air", "deepseek-v3.2"]);
    }
  );
});

test("resolveAiEnv falls back to DEFAULT_PLAYER_CHAIN when chain empty after parse", () => {
  withEnv(
    {
      DEEPSEEK_API_KEY: "a",
      AI_PLAYER_MODEL_CHAIN: "gpt-4",
    },
    () => {
      const e = resolveAiEnv();
      assert.deepEqual(e.playerChatFallbackChain, DEFAULT_PLAYER_CHAIN);
    }
  );
});

test("anyAiProviderConfigured is false when all keys missing", () => {
  withEnv(
    {
      DEEPSEEK_API_KEY: undefined,
      ZHIPU_API_KEY: undefined,
      BIGMODEL_API_KEY: undefined,
      MINIMAX_API_KEY: undefined,
    },
    () => {
      assert.equal(anyAiProviderConfigured(), false);
    }
  );
});

test("resolveOperationMode reads AI_OPERATION_MODE aliases", () => {
  withEnv(
    { AI_OPERATION_MODE: "emergency", AI_DEGRADE_MODE: undefined },
    () => {
      assert.equal(resolveOperationMode(), "emergency");
    }
  );
  withEnv(
    { AI_OPERATION_MODE: undefined, AI_DEGRADE_MODE: "safe" },
    () => {
      assert.equal(resolveOperationMode(), "safe");
    }
  );
  withEnv(
    { AI_OPERATION_MODE: undefined, AI_DEGRADE_MODE: undefined },
    () => {
      assert.equal(resolveOperationMode(), "full");
    }
  );
});
