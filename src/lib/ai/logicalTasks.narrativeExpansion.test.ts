import test from "node:test";
import assert from "node:assert/strict";
import { resetProviderCircuitsForTests } from "@/lib/ai/fallback/circuitBreaker";
import { resetModelCircuitsForTests } from "@/lib/ai/fallback/modelCircuit";
import { expandNarrativeOnly } from "@/lib/ai/logicalTasks";
import type { NarrativeBudget } from "@/lib/playRealtime/narrativeBudgetPackets";

function patchEnv(updates: Record<string, string | undefined>): () => void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(updates)) {
    prev[key] = process.env[key];
    const value = updates[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const key of Object.keys(updates)) {
      const old = prev[key];
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
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
                narrative:
                  "我推开门，冷风先贴上手背，像有人从门缝里轻轻吹了一口气。走廊尽头的灯闪了两下，墙皮下传来细小的刮擦声，原本只是黑暗的门洞忽然有了重量。",
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
    narrativeBudget: standardBudget,
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
