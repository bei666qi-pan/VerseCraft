import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { OPTIONS_REGEN_LATENCY_BUDGET, VC_WAITING } from "@/lib/perf/waitingConfig";

const waitingConfigPath = path.resolve("src/lib/perf/waitingConfig.ts");
const chatRoutePath = path.resolve("src/app/api/chat/route.ts");
const playPagePath = path.resolve("src/app/play/page.tsx");

test("options regen budget: P50 <= 2500ms, P75 <= 4000ms, P95 <= 6000ms, P99 <= 8500ms", () => {
  assert.equal(OPTIONS_REGEN_LATENCY_BUDGET.p50TargetMs <= 2_500, true);
  assert.equal(OPTIONS_REGEN_LATENCY_BUDGET.p75TargetMs <= 4_000, true);
  assert.equal(OPTIONS_REGEN_LATENCY_BUDGET.p95TargetMs <= 6_000, true);
  assert.equal(OPTIONS_REGEN_LATENCY_BUDGET.p99TargetMs <= 8_500, true);
});

test("options regen budget: hard deadlines cannot exceed short-link ceilings", () => {
  assert.equal(OPTIONS_REGEN_LATENCY_BUDGET.clientDeadlineMs <= 9_000, true);
  assert.equal(OPTIONS_REGEN_LATENCY_BUDGET.openingClientDeadlineMs <= 11_000, true);
  assert.equal(OPTIONS_REGEN_LATENCY_BUDGET.serverBudgetMs <= 8_500, true);
  assert.equal(OPTIONS_REGEN_LATENCY_BUDGET.firstAttemptTimeoutMs <= 5_500, true);
  assert.equal(OPTIONS_REGEN_LATENCY_BUDGET.repairAttemptTimeoutMs <= 3_000, true);
  assert.equal(OPTIONS_REGEN_LATENCY_BUDGET.localFallbackOptionsAllowed, false);
});

test("options regen budget: VC_WAITING mirrors the unified budget object", () => {
  assert.equal(VC_WAITING.playOptionsOnlyClientDeadlineMs, OPTIONS_REGEN_LATENCY_BUDGET.clientDeadlineMs);
  assert.equal(VC_WAITING.playOpeningOptionsOnlyClientDeadlineMs, OPTIONS_REGEN_LATENCY_BUDGET.openingClientDeadlineMs);
  assert.equal(VC_WAITING.optionsOnlyFallbackRequestTimeoutMs, OPTIONS_REGEN_LATENCY_BUDGET.p99TargetMs);
  assert.equal(VC_WAITING.optionsOnlyFallbackAttempt1TimeoutMs, OPTIONS_REGEN_LATENCY_BUDGET.firstAttemptTimeoutMs);
  assert.equal(VC_WAITING.optionsOnlyFallbackAttempt2TimeoutMs, OPTIONS_REGEN_LATENCY_BUDGET.repairAttemptTimeoutMs);
  assert.equal(VC_WAITING.optionsOnlyServerBudgetMs, OPTIONS_REGEN_LATENCY_BUDGET.serverBudgetMs);
});

test("options regen budget: options-only timeout fields are not magic numbers or tight-timeout gated", () => {
  const src = fs.readFileSync(waitingConfigPath, "utf8");
  const requiredReferences = [
    "playOptionsOnlyClientDeadlineMs: OPTIONS_REGEN_LATENCY_BUDGET.clientDeadlineMs",
    "playOpeningOptionsOnlyClientDeadlineMs: OPTIONS_REGEN_LATENCY_BUDGET.openingClientDeadlineMs",
    "optionsOnlyFallbackRequestTimeoutMs: OPTIONS_REGEN_LATENCY_BUDGET.p99TargetMs",
    "optionsOnlyFallbackAttempt1TimeoutMs: OPTIONS_REGEN_LATENCY_BUDGET.firstAttemptTimeoutMs",
    "optionsOnlyFallbackAttempt2TimeoutMs: OPTIONS_REGEN_LATENCY_BUDGET.repairAttemptTimeoutMs",
    "optionsOnlyServerBudgetMs: OPTIONS_REGEN_LATENCY_BUDGET.serverBudgetMs",
  ];
  for (const reference of requiredReferences) {
    assert.equal(src.includes(reference), true, `missing unified budget reference: ${reference}`);
  }

  const optionsOnlyBlock = src.slice(
    src.indexOf("playOptionsOnlyClientDeadlineMs:"),
    src.indexOf("narrativeExpansionServerBudgetMs:")
  );
  assert.equal(optionsOnlyBlock.includes("NEXT_PUBLIC_VC_TIGHT_TIMEOUTS"), false);
});

test("options regen budget: server env override cannot widen options_regen_only beyond budget", () => {
  const src = fs.readFileSync(chatRoutePath, "utf8");
  assert.match(
    src,
    /Math\.min\(\s*OPTIONS_REGEN_LATENCY_BUDGET\.serverBudgetMs,\s*envNumber\("VC_OPTIONS_ONLY_SERVER_BUDGET_MS"/s
  );
});

test("options regen budget: client options-only deadline cannot be disabled by rollout env", () => {
  const src = fs.readFileSync(playPagePath, "utf8");
  assert.equal(src.includes("clientOptionsOnlyDeadline"), false);
  assert.match(src, /window\.setTimeout\(\(\) => \{\s*optionsRegenTimedOut = true;\s*ac\.abort\(\);\s*\}, optionsOnlyDeadlineMs\)/s);
});
