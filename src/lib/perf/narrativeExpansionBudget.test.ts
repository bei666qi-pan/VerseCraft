import assert from "node:assert/strict";
import test from "node:test";
import { CHAT_LATENCY_BUDGET, VC_WAITING } from "@/lib/perf/waitingConfig";

test("narrative expansion budget accommodates a normal live JSON expansion", () => {
  assert.equal(VC_WAITING.narrativeExpansionServerBudgetMs, 10_000);
  assert.ok(VC_WAITING.narrativeExpansionServerBudgetMs >= 8_000);
});

test("narrative expansion remains bounded below the normal final-turn budget", () => {
  assert.ok(VC_WAITING.narrativeExpansionServerBudgetMs < CHAT_LATENCY_BUDGET.normalTurnFinalP50Ms - 500);
  assert.ok(VC_WAITING.narrativeExpansionServerBudgetMs < CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms);
});
