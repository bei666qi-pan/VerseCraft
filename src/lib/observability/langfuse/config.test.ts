// src/lib/observability/langfuse/config.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { loadLangfuseConfig, resetLangfuseConfig } from "./config";

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
    resetLangfuseConfig();
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
    resetLangfuseConfig();
  }
}

test("langfuse config: disabled by default", () => {
  withEnv({}, () => {
    const cfg = loadLangfuseConfig();
    assert.equal(cfg.enabled, false);
  });
});

test("langfuse config: enabled with feature flag", () => {
  withEnv({ VERSECRAFT_ENABLE_LANGFUSE: "1" }, () => {
    const cfg = loadLangfuseConfig();
    assert.equal(cfg.enabled, true);
  });
});

test("langfuse config: enabled with 'true'", () => {
  withEnv({ VERSECRAFT_ENABLE_LANGFUSE: "true" }, () => {
    const cfg = loadLangfuseConfig();
    assert.equal(cfg.enabled, true);
  });
});

test("langfuse config: reads canonical keys", () => {
  withEnv({
    VERSECRAFT_ENABLE_LANGFUSE: "1",
    LANGFUSE_PUBLIC_KEY: "pk-test",
    LANGFUSE_SECRET_KEY: "sk-test",
    LANGFUSE_BASE_URL: "https://us.cloud.langfuse.com",
  }, () => {
    const cfg = loadLangfuseConfig();
    assert.equal(cfg.publicKey, "pk-test");
    assert.equal(cfg.secretKey, "sk-test");
    assert.equal(cfg.baseUrl, "https://us.cloud.langfuse.com");
  });
});

test("langfuse config: default base URL", () => {
  withEnv({}, () => {
    const cfg = loadLangfuseConfig();
    assert.equal(cfg.baseUrl, "https://cloud.langfuse.com");
  });
});

test("langfuse config: sample rate defaults by environment", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    assert.equal(loadLangfuseConfig().sampleRate, 0.1);
  });
  withEnv({ NODE_ENV: "staging" }, () => {
    assert.equal(loadLangfuseConfig().sampleRate, 1);
  });
  withEnv({ NODE_ENV: "development" }, () => {
    assert.equal(loadLangfuseConfig().sampleRate, 0);
  });
});

test("langfuse config: sample rate override", () => {
  withEnv({
    NODE_ENV: "production",
    VERSECRAFT_LANGFUSE_SAMPLE_RATE: "0.5",
  }, () => {
    assert.equal(loadLangfuseConfig().sampleRate, 0.5);
  });
});

test("langfuse config: capture content defaults to false", () => {
  withEnv({}, () => {
    assert.equal(loadLangfuseConfig().captureContent, false);
  });
});

test("langfuse config: capture content triple-gate", () => {
  withEnv({ VERSECRAFT_LANGFUSE_CAPTURE_CONTENT: "1" }, () => {
    assert.equal(loadLangfuseConfig().captureContent, true);
  });
});

test("langfuse config: prompt source modes", () => {
  withEnv({ VERSECRAFT_LANGFUSE_PROMPT_SOURCE: "shadow" }, () => {
    assert.equal(loadLangfuseConfig().promptSource, "shadow");
  });
  withEnv({ VERSECRAFT_LANGFUSE_PROMPT_SOURCE: "remote" }, () => {
    assert.equal(loadLangfuseConfig().promptSource, "remote");
  });
  withEnv({}, () => {
    assert.equal(loadLangfuseConfig().promptSource, "local");
  });
});

test("langfuse config: release from BUILD_ID", () => {
  withEnv({ BUILD_ID: "build-123" }, () => {
    assert.equal(loadLangfuseConfig().release, "build-123");
  });
});

test("langfuse config: release from LANGFUSE_RELEASE takes priority", () => {
  withEnv({
    LANGFUSE_RELEASE: "lf-release",
    BUILD_ID: "build-123",
  }, () => {
    assert.equal(loadLangfuseConfig().release, "lf-release");
  });
});

test("langfuse config: flush timeout default", () => {
  withEnv({}, () => {
    assert.equal(loadLangfuseConfig().flushTimeoutMs, 5000);
  });
});

test("langfuse config: flush timeout override", () => {
  withEnv({ VERSECRAFT_LANGFUSE_FLUSH_TIMEOUT_MS: "10000" }, () => {
    assert.equal(loadLangfuseConfig().flushTimeoutMs, 10000);
  });
});
