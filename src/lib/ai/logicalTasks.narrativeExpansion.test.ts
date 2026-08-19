// These tests stub global fetch with fake hosts; the HTTP/1.1 gateway
// transport (AI_GATEWAY_FORCE_HTTP1) would bypass the stub with real DNS.
process.env.AI_UPSTREAM_FORCE_HTTP1 = "0";
import test from "node:test";
import assert from "node:assert/strict";
import { resetProviderCircuitsForTests } from "@/lib/ai/fallback/circuitBreaker";
import { resetModelCircuitsForTests } from "@/lib/ai/fallback/modelCircuit";
import { expandNarrativeOnly, repairNarrativeOnly } from "@/lib/ai/logicalTasks";
import { installManagedAiTestSnapshotFromEnv } from "@/lib/ai/managed/testFixtures";
import type { NarrativeBudget } from "@/lib/playRealtime/narrativeBudgetPackets";

// Kimi Code CLI 运行时注入的环境变量。测试期间需清除。
const KIMI_INJECTED_VARS = [
  "VC_AI_DIRECT_BASE_URL",
  "VC_AI_DIRECT_API_KEY",
  "VC_AI_DIRECT_MODEL",
  "VC_AI_DIRECT_MODEL_MAIN",
  "VC_AI_DIRECT_MODEL_CONTROL",
  "VC_AI_DIRECT_MODEL_ENHANCE",
  "VC_AI_DIRECT_MODEL_REASONER",
  "VC_AI_DIRECT_PLAYER_MODEL",
  "KIMI_MODEL_PROVIDER_TYPE",
  "KIMI_MODEL_BASE_URL",
  "KIMI_MODEL_API_KEY",
  "KIMI_MODEL_NAME",
];

function patchEnv(updates: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(updates)) {
    prev[key] = process.env[key];
    const value = updates[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const k of KIMI_INJECTED_VARS) {
    if (!(k in updates)) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  }
  const restoreSnapshot = installManagedAiTestSnapshotFromEnv();
  return () => {
    restoreSnapshot();
    for (const key of Object.keys(updates)) {
      const old = prev[key];
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
    }
    for (const k of KIMI_INJECTED_VARS) {
      if (!(k in updates)) {
        const old = prev[k];
        if (old === undefined) delete process.env[k];
        else process.env[k] = old;
      }
    }
  };
}

const gatewayEnv = {
  AI_GATEWAY_BASE_URL: "https://gw.expansion.test",
  AI_GATEWAY_API_KEY: "k",
  AI_MODEL_MAIN: "model-main",
  AI_MODEL_CONTROL: "model-control",
  AI_MODEL_ENHANCE: "model-enhance",
  AI_MODEL_REASONER: "model-reasoner",
  AI_MAX_RETRIES: "0",
  AI_TIMEOUT_MS: "5000",
  AI_CIRCUIT_FAILURE_THRESHOLD: "99",
};

const standardBudget: NarrativeBudget = {
  schema: "narrative_budget_v1",
  tier: "standard",
  minChars: 260,
  targetChars: 420,
  maxChars: 520,
  minInfoBeats: 4,
  mustInclude: [],
  stopRule: "stop",
  reasonCodes: ["test"],
};

test("expandNarrativeOnly returns only validated narrative and ignores structure fields", async (t) => {
  const restore = patchEnv(gatewayEnv);
  const origFetch = globalThis.fetch;
  let bodyText = "";
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodyText = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                narrative: "走廊的灯闪了一下，我握紧门把，听见风从墙缝里穿过。".repeat(10),
                is_death: true,
                options: ["不该被采用"],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const result = await expandNarrativeOnly({
    originalNarrative: "我推开门。",
    originalDmRecord: {
      narrative: "我推开门。",
      is_death: false,
      options: ["继续看"],
    },
    narrativeBudget: { ...standardBudget, minChars: 1, maxChars: 800 },
    latestUserInput: "推开门",
    playerContextSnapshot: "位置：走廊",
    ctx: { requestId: "expand-test", userId: null, sessionId: "s1", path: "/api/chat" },
    budgetMs: 3000,
  });

  assert.equal(result.ok, true);
  assert.equal(JSON.parse(bodyText).model, "model-enhance");
  if (!result.ok) return;
  assert.equal(typeof result.narrative, "string");
  assert.equal(result.ignoredFieldKeys.includes("is_death"), true);
  assert.equal(result.ignoredFieldKeys.includes("options"), true);
  assert.equal("options" in result, false);
  assert.equal("is_death" in result, false);
});

test("malformed-stream narrative repair omits unadjudicated structure snapshots", async (t) => {
  const restore = patchEnv(gatewayEnv);
  const origFetch = globalThis.fetch;
  let body: Record<string, unknown> = {};
  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ narrative: "我停下脚步，侧耳分辨楼道里由远及近的回声。" }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const result = await repairNarrativeOnly({
    originalNarrative: "听一下周围的声音",
    originalDmRecord: { is_action_legal: true, sanity_damage: 0, is_death: false },
    latestUserInput: "听一下周围的声音",
    playerContextSnapshot: "位置：3F_Stairwell",
    issues: [{ code: "malformed_dm_json" }],
    structureSnapshotMode: "omit",
    ctx: { requestId: "repair-malformed-test", userId: null, sessionId: "s-repair", path: "/api/chat" },
    budgetMs: 3000,
  });

  assert.equal(result.ok, true);
  const messages = body.messages as Array<{ role: string; content: string }>;
  const userPrompt = messages.find((message) => message.role === "user")?.content ?? "";
  assert.match(userPrompt, /没有可供正文新增的结构化状态事实/);
  assert.doesNotMatch(userPrompt, /is_action_legal|sanity_damage|is_death/);
});

test("expandNarrativeOnly returns at its hard budget even when provider fetch ignores abort", async (t) => {
  const restore = patchEnv(gatewayEnv);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => await new Promise<Response>(() => {});
  t.after(() => {
    globalThis.fetch = origFetch;
    restore();
    resetModelCircuitsForTests();
    resetProviderCircuitsForTests();
  });
  resetModelCircuitsForTests();
  resetProviderCircuitsForTests();

  const startedAt = Date.now();
  const result = await expandNarrativeOnly({
    originalNarrative: "我推开门。",
    originalDmRecord: { narrative: "我推开门。", is_death: false },
    narrativeBudget: { ...standardBudget, minChars: 1, maxChars: 800 },
    latestUserInput: "推开门",
    playerContextSnapshot: "位置：走廊",
    ctx: { requestId: "expand-timeout-test", userId: null, sessionId: "s-timeout", path: "/api/chat" },
    budgetMs: 40,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "timeout");
  assert.ok(Date.now() - startedAt < 500);
});
