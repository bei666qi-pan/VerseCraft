import test from "node:test";
import assert from "node:assert/strict";
import {
  compressSessionMemory,
  resolveRuleOutcome,
  runOfflineReasonerTask,
} from "@/lib/ai/logicalTasks";

function withEnv(patch: Record<string, string | undefined>, fn: () => void | Promise<void>): Promise<void> {
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
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      for (const k of Object.keys(patch)) {
        const old = prev[k];
        if (old === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = old;
        }
      }
    });
}

test("runOfflineReasonerTask maps kind to TaskType (no gateway)", async () => {
  await withEnv(
    {
      AI_GATEWAY_BASE_URL: "",
      AI_GATEWAY_API_KEY: "",
      AI_MODEL_MAIN: "",
      AI_MODEL_CONTROL: "",
      AI_MODEL_ENHANCE: "",
      AI_MODEL_REASONER: "",
    },
    async () => {
      const res = await runOfflineReasonerTask({
        kind: "dev_assist",
        messages: [{ role: "user", content: "x" }],
        ctx: { requestId: "lt-1", path: "/test" },
      });
      assert.equal(res.ok, false);
      assert.equal(res.routing?.task, "DEV_ASSIST");
    }
  );
});

test("runOfflineReasonerTask forwards extraBody to the gateway payload", async () => {
  const origFetch = globalThis.fetch;
  await withEnv(
    {
      AI_GATEWAY_BASE_URL: "https://gw.reasoner.test",
      AI_GATEWAY_API_KEY: "k",
      AI_MODEL_MAIN: "model-main",
      AI_MODEL_CONTROL: "model-control",
      AI_MODEL_ENHANCE: "model-enhance",
      AI_MODEL_REASONER: "model-reasoner",
      AI_MAX_RETRIES: "0",
      AI_TIMEOUT_MS: "5000",
      AI_CIRCUIT_FAILURE_THRESHOLD: "99",
    },
    async () => {
      globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          model?: string;
          enable_thinking?: boolean;
          thinking?: { type?: string };
        };
        assert.equal(body.model, "model-reasoner");
        assert.equal(body.enable_thinking, false);
        assert.equal(body.thinking?.type, "disabled");
        return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
      try {
        const res = await runOfflineReasonerTask({
          kind: "worldbuild",
          messages: [{ role: "user", content: "x" }],
          ctx: { requestId: "lt-extra-body", path: "/test" },
          skipCache: true,
          extraBody: {
            enable_thinking: false,
            thinking: { type: "disabled" },
          },
          devOverrides: { responseFormatJsonObject: true },
        });
        assert.equal(res.ok, true);
      } finally {
        globalThis.fetch = origFetch;
      }
    }
  );
});

test("compressSessionMemory uses MEMORY_COMPRESSION task", async () => {
  await withEnv(
    {
      AI_GATEWAY_BASE_URL: "",
      AI_GATEWAY_API_KEY: "",
      AI_MODEL_MAIN: "",
      AI_MODEL_CONTROL: "",
      AI_MODEL_ENHANCE: "",
      AI_MODEL_REASONER: "",
    },
    async () => {
      const res = await compressSessionMemory({
        messages: [{ role: "user", content: "x" }],
        ctx: { requestId: "lt-2", path: "/test" },
      });
      assert.equal(res.ok, false);
      assert.equal(res.routing?.task, "MEMORY_COMPRESSION");
    }
  );
});

test("resolveRuleOutcome uses RULE_RESOLUTION task", async () => {
  await withEnv(
    {
      AI_GATEWAY_BASE_URL: "",
      AI_GATEWAY_API_KEY: "",
      AI_MODEL_MAIN: "",
      AI_MODEL_CONTROL: "",
      AI_MODEL_ENHANCE: "",
      AI_MODEL_REASONER: "",
    },
    async () => {
      const res = await resolveRuleOutcome({
        messages: [{ role: "user", content: "x" }],
        ctx: { requestId: "lt-3", path: "/test" },
      });
      assert.equal(res.ok, false);
      assert.equal(res.routing?.task, "RULE_RESOLUTION");
    }
  );
});
