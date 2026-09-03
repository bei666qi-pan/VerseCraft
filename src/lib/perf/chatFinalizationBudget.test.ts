import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_FINALIZATION_RESERVE_MS,
  CHAT_STREAM_TIMER_JITTER_RESERVE_MS,
  CHAT_WATCHDOG_DELIVERY_RESERVE_MS,
  resolveChatStreamHardCapMs,
  resolveChatStreamIdleTimeoutMs,
  resolveChatTurnWatchdogMs,
  resolveOptionalEnhanceBudgetMs,
} from "./chatFinalizationBudget";
import { CHAT_LATENCY_BUDGET } from "./waitingConfig";

test("watchdog reserves time to deliver a parseable fallback before the client deadline", () => {
  assert.equal(
    resolveChatTurnWatchdogMs(CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms),
    CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms - CHAT_WATCHDOG_DELIVERY_RESERVE_MS,
  );
  assert.equal(resolveChatTurnWatchdogMs(7_000), 7_000);
});

test("watchdog honors an explicit slower Responses upstream override", () => {
  assert.equal(resolveChatTurnWatchdogMs(35_000), 35_000);
});

test("provider stream rounds share an absolute cap that leaves finalization reserve", () => {
  assert.equal(
    resolveChatStreamHardCapMs(0),
    CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms
      - CHAT_FINALIZATION_RESERVE_MS
      - CHAT_STREAM_TIMER_JITTER_RESERVE_MS,
  );
  assert.equal(resolveChatStreamHardCapMs(7_000), 7_000);
  assert.equal(
    resolveChatStreamHardCapMs(CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms),
    CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms
      - CHAT_FINALIZATION_RESERVE_MS
      - CHAT_STREAM_TIMER_JITTER_RESERVE_MS,
  );
  assert.equal(resolveChatStreamHardCapMs(35_000), 35_000);
});

test("stream idle timeout uses the full final budget instead of the p50 target", () => {
  assert.equal(
    resolveChatStreamIdleTimeoutMs(CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms),
    CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms,
  );
  assert.equal(resolveChatStreamIdleTimeoutMs(900), 1_000);
  assert.equal(resolveChatStreamIdleTimeoutMs(45_000), CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms);
});

test("optional enhancement runs only when the full configured budget and final reserve remain", () => {
  assert.equal(resolveOptionalEnhanceBudgetMs({ configuredMs: 4_500, elapsedMs: 13_600 }), 0);
  assert.equal(resolveOptionalEnhanceBudgetMs({ configuredMs: 4_500, elapsedMs: 10_000 }), 4_500);
  assert.equal(
    CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms - 10_000 - 4_500,
    CHAT_FINALIZATION_RESERVE_MS + 3_000,
  );
});

test("zero enhancement budget cannot restore an unbounded legacy wait", () => {
  assert.equal(resolveOptionalEnhanceBudgetMs({ configuredMs: 0, elapsedMs: 100 }), 0);
});
