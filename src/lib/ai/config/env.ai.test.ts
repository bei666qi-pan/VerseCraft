// src/lib/ai/config/env.ai.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  anyAiProviderConfigured,
  DEFAULT_PLAYER_ROLE_CHAIN,
  resolveAiEnv,
} from "@/lib/ai/config/envCore";
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

const gatewayBase = {
  AI_GATEWAY_BASE_URL: "https://oneapi.example.com",
  AI_GATEWAY_API_KEY: "sk-gateway",
  AI_MODEL_MAIN: "upstream-main",
  AI_MODEL_CONTROL: "upstream-control",
  AI_MODEL_ENHANCE: "upstream-enhance",
  AI_MODEL_REASONER: "upstream-reasoner",
};

test("resolveAiEnv maps legacy AI_PLAYER_MODEL_CHAIN to roles when AI_PLAYER_ROLE_CHAIN unset", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_PLAYER_ROLE_CHAIN: undefined,
      AI_PLAYER_MODEL_CHAIN: "glm-5-air,deepseek-v3.2,gpt-4",
    },
    () => {
      const e = resolveAiEnv();
      assert.deepEqual(e.playerRoleFallbackChain, ["control", "main"]);
    }
  );
});

test("resolveAiEnv uses AI_PLAYER_ROLE_CHAIN when set", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_PLAYER_ROLE_CHAIN: "control, main",
      AI_PLAYER_MODEL_CHAIN: undefined,
    },
    () => {
      const e = resolveAiEnv();
      assert.deepEqual(e.playerRoleFallbackChain, ["control", "main"]);
    }
  );
});

test("resolveAiEnv falls back to DEFAULT_PLAYER_ROLE_CHAIN when legacy chain yields nothing", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_PLAYER_ROLE_CHAIN: undefined,
      AI_PLAYER_MODEL_CHAIN: "gpt-4",
    },
    () => {
      const e = resolveAiEnv();
      assert.deepEqual(e.playerRoleFallbackChain, DEFAULT_PLAYER_ROLE_CHAIN);
    }
  );
});

test("anyAiProviderConfigured is false when gateway or main model missing", () => {
  withEnv(
    {
      AI_GATEWAY_BASE_URL: undefined,
      AI_GATEWAY_API_KEY: undefined,
      AI_MODEL_MAIN: undefined,
      AI_MODEL_CONTROL: undefined,
      AI_MODEL_ENHANCE: undefined,
      AI_MODEL_REASONER: undefined,
    },
    () => {
      assert.equal(anyAiProviderConfigured(), false);
    }
  );
});

test("anyAiProviderConfigured is true when gateway URL, key, and AI_MODEL_MAIN set", () => {
  withEnv(
    {
      AI_GATEWAY_BASE_URL: "https://x.com",
      AI_GATEWAY_API_KEY: "k",
      AI_MODEL_MAIN: "m",
    },
    () => {
      assert.equal(anyAiProviderConfigured(), true);
    }
  );
});

test("resolveAiEnv normalizes AI_GATEWAY_BASE_URL to /v1/chat/completions", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_GATEWAY_BASE_URL: "https://oneapi.example.com/",
    },
    () => {
      assert.equal(
        resolveAiEnv().gatewayBaseUrl,
        "https://oneapi.example.com/v1/chat/completions"
      );
    }
  );
});

test("resolveAiEnv keeps full chat completions URL when already suffixed", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_GATEWAY_BASE_URL: "https://oneapi.example.com/v1/chat/completions",
    },
    () => {
      assert.equal(
        resolveAiEnv().gatewayBaseUrl,
        "https://oneapi.example.com/v1/chat/completions"
      );
    }
  );
});

test("resolveAiEnv reads AI_REQUEST_TIMEOUT_MS when AI_TIMEOUT_MS unset", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_TIMEOUT_MS: undefined,
      AI_REQUEST_TIMEOUT_MS: "15000",
    },
    () => {
      assert.equal(resolveAiEnv().defaultTimeoutMs, 15_000);
    }
  );
});

test("resolveAiEnv maps AI_MEMORY_MODEL legacy id to memoryPrimaryRole", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_MEMORY_PRIMARY_ROLE: undefined,
      AI_MEMORY_MODEL: "deepseek-reasoner",
    },
    () => {
      assert.equal(resolveAiEnv().memoryPrimaryRole, "reasoner");
    }
  );
});

test("resolveAiEnv maps enhance model to main when AI_MODEL_ENHANCE is unset", () => {
  withEnv(
    {
      AI_GATEWAY_BASE_URL: "https://oneapi.example.com",
      AI_GATEWAY_API_KEY: "sk-gateway",
      AI_MODEL_MAIN: "vc-main",
      AI_MODEL_CONTROL: "vc-control",
      AI_MODEL_ENHANCE: undefined,
      AI_MODEL_REASONER: "vc-reasoner",
    },
    () => {
      const e = resolveAiEnv();
      assert.equal(e.modelsByRole.enhance, "vc-main");
    }
  );
});

test("resolveAiEnv keeps narrative enhancement disabled by default", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_ENABLE_NARRATIVE_ENHANCEMENT: undefined,
    },
    () => {
      assert.equal(resolveAiEnv().enableNarrativeEnhancement, false);
    }
  );
});

test("resolveAiEnv enables narrative enhancement when explicitly set", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_ENABLE_NARRATIVE_ENHANCEMENT: "1",
    },
    () => {
      assert.equal(resolveAiEnv().enableNarrativeEnhancement, true);
    }
  );
});

test("resolveAiEnv uses default lore retrieval budget", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_LORE_RETRIEVAL_BUDGET_MS: undefined,
    },
    () => {
      assert.equal(resolveAiEnv().loreRetrievalBudgetMs, 600);
    }
  );
});

test("resolveOperationMode reads AI_OPERATION_MODE aliases", () => {
  withEnv({ AI_OPERATION_MODE: "emergency", AI_DEGRADE_MODE: undefined }, () => {
    assert.equal(resolveOperationMode(), "emergency");
  });
  withEnv({ AI_OPERATION_MODE: undefined, AI_DEGRADE_MODE: "safe" }, () => {
    assert.equal(resolveOperationMode(), "safe");
  });
  withEnv({ AI_OPERATION_MODE: undefined, AI_DEGRADE_MODE: undefined }, () => {
    assert.equal(resolveOperationMode(), "full");
  });
});
