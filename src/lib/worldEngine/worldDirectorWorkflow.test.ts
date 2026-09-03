import assert from "node:assert/strict";
import test from "node:test";

import type { AIResponse } from "@/lib/ai/types";
import { runWorldDirectorWorkflow } from "./worldDirectorWorkflow";

test("one Director tick performs exactly one model invocation", async () => {
  let calls = 0;
  const result = await runWorldDirectorWorkflow({
    messages: [{ role: "user", content: "{}" }],
    requestId: "director-1",
    userId: "user-1",
    sessionId: "session-1",
    worldId: "dark_moon_prologue",
    mapId: "dark_moon_apartment",
    execute: async () => {
      calls += 1;
      return {
        ok: true,
        providerId: "mock",
        logicalRole: "reasoner",
        content: "{}",
        usage: { promptTokens: 20, completionTokens: 8, totalTokens: 28 },
        latencyMs: 1,
      } satisfies AIResponse;
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.actualUsage?.usage?.totalTokens, 28);
});

test("Director rejects an invocation before the provider when the shared budget is exhausted", async () => {
  let calls = 0;
  const result = await runWorldDirectorWorkflow({
    messages: [{ role: "user", content: "{}" }],
    requestId: "director-budget",
    userId: "user-1",
    sessionId: "session-1",
    worldId: "dark_moon_prologue",
    mapId: "dark_moon_apartment",
    limits: { maxModelCalls: 0 },
    execute: async () => {
      calls += 1;
      throw new Error("provider must not run");
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.ok, false);
  assert.equal(result.code, "BUDGET_EXCEEDED");
  assert.equal(result.actualUsage, null);
});
