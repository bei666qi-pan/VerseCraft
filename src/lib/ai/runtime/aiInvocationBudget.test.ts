import test from "node:test";
import assert from "node:assert/strict";
import { createAiInvocationBudget } from "./aiInvocationBudget";

test("invocation budget rejects a third mechanics model call", () => {
  const now = 1_000;
  const budget = createAiInvocationBudget(
    { maxCalls: 2, maxOutputTokens: 4096, deadlineMs: 20_000 },
    () => now,
  );

  assert.deepEqual(budget.claim({ outputTokens: 2048 }), { ok: true, callIndex: 1 });
  assert.deepEqual(budget.claim({ outputTokens: 2048 }), { ok: true, callIndex: 2 });
  assert.deepEqual(budget.claim({ outputTokens: 1 }), { ok: false, reason: "max_calls" });
});

test("invocation budget rejects output tokens, cost and elapsed deadline independently", () => {
  let now = 5_000;
  const budget = createAiInvocationBudget(
    { maxCalls: 3, maxOutputTokens: 2048, deadlineMs: 100, maxEstimatedCostCnyMicros: 50 },
    () => now,
  );

  assert.deepEqual(budget.claim({ outputTokens: 2049 }), { ok: false, reason: "max_output_tokens" });
  assert.deepEqual(budget.claim({ outputTokens: 1024, estimatedCostCnyMicros: 51 }), { ok: false, reason: "max_cost" });
  now = 5_101;
  assert.deepEqual(budget.claim({ outputTokens: 1 }), { ok: false, reason: "deadline" });
  assert.deepEqual(budget.snapshot(), {
    claimedCalls: 0,
    claimedOutputTokens: 0,
    claimedEstimatedCostCnyMicros: 0,
    elapsedMs: 101,
  });
});

test("rejected claims do not consume later valid capacity", () => {
  const budget = createAiInvocationBudget({ maxCalls: 1, maxOutputTokens: 100, deadlineMs: 1_000 }, () => 10);
  assert.equal(budget.claim({ outputTokens: 101 }).ok, false);
  assert.deepEqual(budget.claim({ outputTokens: 100 }), { ok: true, callIndex: 1 });
});
