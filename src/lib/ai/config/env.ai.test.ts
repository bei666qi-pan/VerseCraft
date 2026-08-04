// src/lib/ai/config/env.ai.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  anyAiProviderConfigured,
  DEFAULT_PLAYER_ROLE_CHAIN,
  resolveAiEnv,
} from "@/lib/ai/config/envCore";
import { resolveOperationMode } from "@/lib/ai/degrade/modeCore";
import { VC_WAITING } from "@/lib/perf/waitingConfig";

// Kimi Code CLI 运行时注入的环境变量，会绕过 withEnv 补丁。
// 测试需要在执行前主动清除这些变量，除非显式设置了它们。
const KIMI_INJECTED_VARS = [
  // VC_AI_DIRECT_* injected by Kimi Code CLI / Codex DeepSeek
  "VC_AI_DIRECT_BASE_URL",
  "VC_AI_DIRECT_API_KEY",
  "VC_AI_DIRECT_MODEL",
  "VC_AI_DIRECT_MODEL_MAIN",
  "VC_AI_DIRECT_MODEL_CONTROL",
  "VC_AI_DIRECT_MODEL_ENHANCE",
  "VC_AI_DIRECT_MODEL_REASONER",
  "VC_AI_DIRECT_PLAYER_MODEL",
  "VC_AI_DIRECT_SOURCE",
  // Kimi Code CLI model binding
  "KIMI_MODEL_PROVIDER_TYPE",
  "KIMI_MODEL_BASE_URL",
  "KIMI_MODEL_API_KEY",
  "KIMI_MODEL_NAME",
  // Gateway provider override (injected by Kimi/Codex as openai_compatible)
  "AI_GATEWAY_PROVIDER",
  // Extra body injections that override thinking/reasoning defaults
  "AI_GATEWAY_MERGE_EXTRA_BODY",
  "AI_GATEWAY_EXTRA_BODY_JSON",
  "AI_PLAYER_CHAT_MERGE_EXTRA_BODY",
  "AI_PLAYER_CHAT_EXTRA_BODY_JSON",
  "AI_PLAYER_CHAT_DISABLE_THINKING",
  "AI_ONLINE_SHORT_JSON_DISABLE_THINKING",
];

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  // 保存 patch 中的原始值
  for (const k of Object.keys(patch)) {
    prev[k] = process.env[k];
    const v = patch[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  // 清除 Kimi 注入变量（除非 patch 中显式设置了它们）
  for (const k of KIMI_INJECTED_VARS) {
    if (!(k in patch)) {
      prev[k] = process.env[k];
      delete process.env[k];
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
    // 恢复 Kimi 注入变量
    for (const k of KIMI_INJECTED_VARS) {
      if (!(k in patch)) {
        const old = prev[k];
        if (old === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = old;
        }
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

test("resolveAiEnv gives the kimi-ds direct binding priority over project gateway env", () => {
  withEnv(
    {
      ...gatewayBase,
      VC_AI_DIRECT_BASE_URL: "https://direct-gateway.example/v1",
      VC_AI_DIRECT_API_KEY: "direct-key",
      VC_AI_DIRECT_MODEL: "deepseek-v4-flash",
      AI_PLAYER_CHAT_DISABLE_THINKING: "1",
      AI_ONLINE_SHORT_JSON_DISABLE_THINKING: "1",
    },
    () => {
      const env = resolveAiEnv();
      assert.equal(env.gatewayProvider, "openai_compatible");
      assert.equal(env.gatewayBaseUrl, "https://direct-gateway.example/v1/chat/completions");
      assert.equal(env.gatewayApiKey, "direct-key");
      assert.deepEqual(env.modelsByRole, {
        main: "deepseek-v4-flash",
        control: "deepseek-v4-flash",
        enhance: "deepseek-v4-flash",
        reasoner: "deepseek-v4-flash",
        writer: "deepseek-v4-flash",
      });
      assert.deepEqual(env.playerChatExtraBody, {
        enable_thinking: false,
        thinking: { type: "disabled" },
      });
      assert.equal(env.onlineShortJsonDisableThinking, true);
    }
  );
});

test("resolveAiEnv scopes Flash to gameplay while all logical roles stay on Pro", () => {
  withEnv(
    {
      ...gatewayBase,
      VC_AI_DIRECT_BASE_URL: "https://direct-gateway.example/v1",
      VC_AI_DIRECT_API_KEY: "direct-key",
      VC_AI_DIRECT_MODEL: undefined,
      VC_AI_DIRECT_PLAYER_MODEL: "deepseek-v4-flash",
      VC_AI_DIRECT_MODEL_MAIN: "deepseek-v4-pro-202606",
      VC_AI_DIRECT_MODEL_CONTROL: "deepseek-v4-pro-202606",
      VC_AI_DIRECT_MODEL_ENHANCE: "deepseek-v4-pro-202606",
      VC_AI_DIRECT_MODEL_REASONER: "deepseek-v4-pro-202606",
    },
    () => {
      assert.equal(resolveAiEnv().playerGameplayModel, "deepseek-v4-flash");
      assert.deepEqual(resolveAiEnv().modelsByRole, {
        main: "deepseek-v4-pro-202606",
        control: "deepseek-v4-pro-202606",
        enhance: "deepseek-v4-pro-202606",
        reasoner: "deepseek-v4-pro-202606",
        writer: "deepseek-v4-pro-202606",
      });
    }
  );
});

test("resolveAiEnv inherits an existing kimi-ds OpenAI binding without affecting ordinary Kimi", () => {
  withEnv(
    {
      ...gatewayBase,
      VC_AI_DIRECT_BASE_URL: undefined,
      VC_AI_DIRECT_API_KEY: undefined,
      VC_AI_DIRECT_MODEL: undefined,
      KIMI_MODEL_PROVIDER_TYPE: "openai",
      KIMI_MODEL_BASE_URL: "https://kimi-openai.example/v1",
      KIMI_MODEL_API_KEY: "kimi-openai-key",
      KIMI_MODEL_NAME: "kimi-openai-model",
    },
    () => {
      const env = resolveAiEnv();
      assert.equal(env.gatewayProvider, "openai_compatible");
      assert.equal(env.gatewayBaseUrl, "https://kimi-openai.example/v1/chat/completions");
      assert.equal(env.gatewayApiKey, "kimi-openai-key");
      assert.equal(env.modelsByRole.main, "kimi-openai-model");
    }
  );

  withEnv(
    {
      ...gatewayBase,
      VC_AI_DIRECT_BASE_URL: undefined,
      VC_AI_DIRECT_API_KEY: undefined,
      VC_AI_DIRECT_MODEL: undefined,
      KIMI_MODEL_PROVIDER_TYPE: "kimi",
      KIMI_MODEL_BASE_URL: "https://ordinary-kimi.example/v1",
      KIMI_MODEL_API_KEY: "ordinary-kimi-key",
      KIMI_MODEL_NAME: "ordinary-kimi-model",
    },
    () => {
      const env = resolveAiEnv();
      assert.equal(env.gatewayProvider, "oneapi");
      assert.equal(env.gatewayBaseUrl, "https://oneapi.example.com/v1/chat/completions");
      assert.equal(env.gatewayApiKey, "sk-gateway");
      assert.equal(env.modelsByRole.main, "upstream-main");
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

test("resolveAiEnv defaults enhance and reasoner to dedicated vc deployments when unset", () => {
  withEnv(
    {
      AI_GATEWAY_BASE_URL: "https://oneapi.example.com",
      AI_GATEWAY_API_KEY: "sk-gateway",
      AI_MODEL_MAIN: "vc-main",
      AI_MODEL_CONTROL: "vc-control",
      AI_MODEL_ENHANCE: undefined,
      AI_MODEL_REASONER: undefined,
    },
    () => {
      const e = resolveAiEnv();
      assert.equal(e.modelsByRole.enhance, "vc-enhance");
      assert.equal(e.modelsByRole.reasoner, "vc-reasoner");
    }
  );
});

test("resolveAiEnv enables narrative enhancement by default with a finite budget", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_ENABLE_NARRATIVE_ENHANCEMENT: undefined,
      AI_NARRATIVE_ENHANCE_BUDGET_MS: undefined,
    },
    () => {
      const env = resolveAiEnv();
      assert.equal(env.enableNarrativeEnhancement, true);
      assert.equal(env.narrativeEnhanceBudgetMs, 4_500);
    }
  );
});

test("resolveAiEnv disables narrative enhancement when explicitly set off", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_ENABLE_NARRATIVE_ENHANCEMENT: "0",
    },
    () => {
      assert.equal(resolveAiEnv().enableNarrativeEnhancement, false);
    }
  );
});

test("resolveAiEnv keeps narrative expansion on by default in production", () => {
  withEnv(
    {
      ...gatewayBase,
      APP_ENV: "production",
      AI_NARRATIVE_EXPANSION_ENABLED: undefined,
    },
    () => {
      assert.equal(resolveAiEnv().enableNarrativeExpansion, true);
    }
  );
});

test("resolveAiEnv allows narrative expansion in staging by default and supports override", () => {
  withEnv(
    {
      ...gatewayBase,
      APP_ENV: "staging",
      AI_NARRATIVE_EXPANSION_ENABLED: undefined,
    },
    () => {
      assert.equal(resolveAiEnv().enableNarrativeExpansion, true);
    }
  );
  withEnv(
    {
      ...gatewayBase,
      APP_ENV: "staging",
      AI_NARRATIVE_EXPANSION_ENABLED: "0",
    },
    () => {
      assert.equal(resolveAiEnv().enableNarrativeExpansion, false);
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

test("resolveAiEnv budgets control preflight by default and allows rollback", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_CONTROL_PREFLIGHT_BUDGET_MS: undefined,
    },
    () => {
      assert.equal(resolveAiEnv().controlPreflightBudgetMs, 260);
    }
  );
  withEnv(
    {
      ...gatewayBase,
      AI_CONTROL_PREFLIGHT_BUDGET_MS: "0",
    },
    () => {
      assert.equal(resolveAiEnv().controlPreflightBudgetMs, 0);
    }
  );
});

test("resolveAiEnv disables thinking for online short JSON by default and supports rollback", () => {
  withEnv({ ...gatewayBase, AI_ONLINE_SHORT_JSON_DISABLE_THINKING: undefined }, () => {
    assert.equal(resolveAiEnv().onlineShortJsonDisableThinking, true);
  });
  withEnv({ ...gatewayBase, AI_ONLINE_SHORT_JSON_DISABLE_THINKING: "0" }, () => {
    assert.equal(resolveAiEnv().onlineShortJsonDisableThinking, false);
  });
});

test("resolveAiEnv uses bounded player chat upstream timeout defaults", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_PLAYER_CHAT_TIMEOUTS_V2: undefined,
      AI_PLAYER_CHAT_FASTLANE_TIMEOUT_MS: undefined,
      AI_PLAYER_CHAT_SLOWLANE_TIMEOUT_MS: undefined,
      AI_PLAYER_CHAT_STREAM_RECONNECT_WALL_MS: undefined,
    },
    () => {
      const e = resolveAiEnv();
      assert.equal(e.playerChatFastLaneTimeoutMs, 18_000);
      assert.equal(e.playerChatSlowLaneTimeoutMs, 45_000);
      assert.equal(e.playerChatStreamReconnectWallMs, VC_WAITING.playerChatStreamReconnectWallDefaultMs);
    }
  );
});

test("resolveAiEnv allows explicit stream reconnect wall override", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_PLAYER_CHAT_STREAM_RECONNECT_WALL_MS: "22000",
    },
    () => {
      assert.equal(resolveAiEnv().playerChatStreamReconnectWallMs, 22_000);
    }
  );
});

test("resolveAiEnv can roll player chat upstream timeouts back", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_PLAYER_CHAT_TIMEOUTS_V2: "0",
      AI_PLAYER_CHAT_FASTLANE_TIMEOUT_MS: undefined,
      AI_PLAYER_CHAT_SLOWLANE_TIMEOUT_MS: undefined,
      AI_PLAYER_CHAT_STREAM_RECONNECT_WALL_MS: undefined,
    },
    () => {
      const e = resolveAiEnv();
      assert.equal(e.playerChatFastLaneTimeoutMs, 60_000);
      assert.equal(e.playerChatSlowLaneTimeoutMs, 60_000);
      assert.equal(e.playerChatStreamReconnectWallMs, 0);
    }
  );
});

test("resolveAiEnv disables player chat thinking by default and keeps gateway extra body task-scoped", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_PLAYER_CHAT_DISABLE_THINKING: undefined,
      AI_PLAYER_CHAT_MERGE_EXTRA_BODY: undefined,
      AI_PLAYER_CHAT_EXTRA_BODY_JSON: undefined,
      AI_GATEWAY_MERGE_EXTRA_BODY: undefined,
      AI_GATEWAY_EXTRA_BODY_JSON: undefined,
    },
    () => {
      const e = resolveAiEnv();
      assert.deepEqual(e.playerChatExtraBody, {
        enable_thinking: false,
        thinking: { type: "disabled" },
      });
      assert.equal(e.gatewayExtraBody, undefined);
    }
  );
});

test("resolveAiEnv allows player chat thinking extra body rollback and explicit merge", () => {
  withEnv(
    {
      ...gatewayBase,
      AI_PLAYER_CHAT_DISABLE_THINKING: "0",
      AI_PLAYER_CHAT_MERGE_EXTRA_BODY: "1",
      AI_PLAYER_CHAT_EXTRA_BODY_JSON: '{"enable_thinking":false}',
      AI_GATEWAY_MERGE_EXTRA_BODY: undefined,
      AI_GATEWAY_EXTRA_BODY_JSON: undefined,
    },
    () => {
      const e = resolveAiEnv();
      assert.deepEqual(e.playerChatExtraBody, { enable_thinking: false });
      assert.equal(e.gatewayExtraBody, undefined);
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
