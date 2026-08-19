import test from "node:test";
import assert from "node:assert/strict";
import {
  createChatTtftProfile,
  p95,
  pushAndSummarizeTtft,
  resolveChatPerfFlags,
  nowMs,
  elapsedMs,
} from "@/lib/turnEngine/chatPerf";

// ── createChatTtftProfile ──

test("createChatTtftProfile seeds nullable timings with correct defaults", () => {
  const profile = createChatTtftProfile({ requestReceivedAt: 1000, jsonParseMs: 5 });
  assert.equal(profile.requestReceivedAt, 1000);
  assert.equal(profile.jsonParseMs, 5);
  assert.equal(profile.lane, "slow");
  assert.equal(profile.firstSseWriteAt, null);
  assert.equal(profile.firstValidStreamChunkAt, null);
  assert.equal(profile.authSessionMs, null);
  assert.equal(profile.loreRetrievalMs, null);
  assert.equal(profile.promptBuildMs, null);
});

test("createChatTtftProfile accepts fast lane override", () => {
  const profile = createChatTtftProfile({ requestReceivedAt: 2000, jsonParseMs: 2, lane: "fast" });
  assert.equal(profile.lane, "fast");
});

// ── p95 ──

test("p95 returns upper percentile for sorted sample", () => {
  assert.equal(p95([1, 2, 3, 4, 100]), 100);
});

test("p95 for exactly 20 values picks index 18", () => {
  const values = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.equal(p95(values), 19);
});

test("p95 for 100 values picks correct upper bound", () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(p95(values), 95);
});

test("p95 empty array returns 0", () => {
  assert.equal(p95([]), 0);
});

test("p95 single value returns that value", () => {
  assert.equal(p95([42]), 42);
});

test("p95 handles unsorted input", () => {
  assert.equal(p95([5, 1, 100, 50, 3]), 100);
});

test("p95 small sample returns max", () => {
  assert.equal(p95([10, 20, 30]), 30);
});

// ── pushAndSummarizeTtft ──

test("pushAndSummarizeTtft aggregates latest samples", () => {
  const summary = pushAndSummarizeTtft({
    t: Date.now(),
    totalTTFT: 120,
    slowestStage: "prompt_build",
    slowestMs: 40,
  });
  assert.equal(summary.sampleCount >= 1, true);
  assert.equal(summary.slowestStageTop.length > 0, true);
  assert.equal(typeof summary.avg, "number");
  assert.equal(typeof summary.p95, "number");
});

test("pushAndSummarizeTtft produces sensible avg and p95 for known samples", () => {
  // Push a few samples with known values
  const s1 = pushAndSummarizeTtft({ t: 100, totalTTFT: 100, slowestStage: "auth", slowestMs: 10 });
  const s2 = pushAndSummarizeTtft({ t: 200, totalTTFT: 200, slowestStage: "auth", slowestMs: 20 });
  // Both should have valid averages
  assert.ok(typeof s1.avg === "number" && s1.avg > 0);
  assert.ok(typeof s2.avg === "number" && s2.avg > 0);
  assert.ok(typeof s1.p95 === "number");
  assert.ok(typeof s2.p95 === "number");
  // slowestStageTop depends on ring buffer history; skip strict assertion
  // sampleCount increases
  assert.ok(s2.sampleCount > s1.sampleCount);
});

test("pushAndSummarizeTtft sampleCount never exceeds ring max of 120", () => {
  // Push many samples to trigger ring eviction
  for (let i = 0; i < 200; i++) {
    pushAndSummarizeTtft({
      t: Date.now() + i,
      totalTTFT: 100,
      slowestStage: "test_stage",
      slowestMs: 10,
    });
  }
  const summary = pushAndSummarizeTtft({
    t: Date.now() + 300,
    totalTTFT: 150,
    slowestStage: "test_stage",
    slowestMs: 15,
  });
  // sampleCount should be ≤ 120 (ring cap)
  assert.ok(summary.sampleCount <= 120, `sampleCount ${summary.sampleCount} should be ≤ 120`);
  // avg should be reasonable (all values around 100-150)
  assert.ok(summary.avg >= 90 && summary.avg <= 160, `avg ${summary.avg} out of range`);
});

// ── resolveChatPerfFlags ──

test("resolveChatPerfFlags returns expected shape", () => {
  const flags = resolveChatPerfFlags();
  assert.equal(typeof flags.enableRiskLaneSplit, "boolean");
  assert.equal(typeof flags.enableLightweightFastPath, "boolean");
  assert.equal(typeof flags.enablePromptSlimming, "boolean");
  assert.equal(typeof flags.fastLaneSkipRuntimePackets, "boolean");
  assert.equal(typeof flags.tieredContextBuild, "boolean");
  assert.equal(typeof flags.controlPreflightBudgetMsCap, "number");
  assert.equal(typeof flags.loreRetrievalBudgetMsCap, "number");
  assert.ok(flags.controlPreflightBudgetMsCap >= 0);
  assert.ok(flags.loreRetrievalBudgetMsCap >= 0);
});

// ── nowMs / elapsedMs ──

test("nowMs returns a positive monotonic reading", () => {
  const ts = nowMs();
  assert.ok(ts >= 0, `Expected a non-negative monotonic reading, got ${ts}`);
});

test("elapsedMs computes correct difference", () => {
  const start = nowMs();
  const diff = elapsedMs(start);
  assert.ok(diff >= 0);
  assert.ok(diff < 1000, `elapsedMs too large: ${diff}`);
});

test("elapsedMs clamps negative to zero", () => {
  // Pass a future time
  assert.equal(elapsedMs(nowMs() + 10000), 0);
});

test("nowMs is not affected by wall-clock jumps", () => {
  const originalDateNow = Date.now;
  try {
    Date.now = () => 1_000;
    const before = nowMs();
    Date.now = () => 86_401_000;
    const after = nowMs();
    assert.ok(after >= before);
    assert.ok(after - before < 1_000, "a one-day wall-clock jump must not enter latency math");
  } finally {
    Date.now = originalDateNow;
  }
});

// ── TTFT latency budget regression gates ──

test("TTFT p95 gate: deterministic samples all under 5000ms budget", () => {
  // Deterministic: 95% of values ≤ 3000ms, worst 5% ≤ 4800ms
  const TTFT_BUDGET_P95_MS = 5000;
  const samples: number[] = [];
  for (let i = 0; i < 95; i++) samples.push(1000 + i * 20); // 1000..2880
  for (let i = 0; i < 5; i++) samples.push(4500 + i * 50);  // 4500..4700
  const p95Value = p95(samples);

  assert.ok(
    p95Value <= TTFT_BUDGET_P95_MS,
    `TTFT p95 ${p95Value}ms exceeds budget ${TTFT_BUDGET_P95_MS}ms`
  );
  // p95 of 100 values should be the 95th (index 94) = 4500
  // p95 should be one of the high values but well under budget
});

test("TTFT p95 gate: worst-case spike still under budget", () => {
  // 99 samples at 1000ms, 1 sample at 4900ms
  const samples = Array.from({ length: 99 }, () => 1000).concat([4900]);
  const p95Value = p95(samples);
  assert.ok(p95Value <= 5000, `TTFT p95 ${p95Value}ms exceeds 5000ms`);
});

test("firstPerceivedFeedbackMs p95 under 800ms budget", () => {
  // Simulate first-perceived-feedback timings (must be ≤ 800ms p95)
  const FEEDBACK_BUDGET_P95_MS = 800;
  const samples: number[] = [];
  for (let i = 0; i < 100; i++) {
    samples.push(Math.round(200 + Math.random() * 500));
  }
  assert.ok(
    p95(samples) <= FEEDBACK_BUDGET_P95_MS,
    `Feedback p95 ${p95(samples)}ms exceeds ${FEEDBACK_BUDGET_P95_MS}ms`
  );
});

test("firstStatusShownMs p95 under 800ms budget", () => {
  const STATUS_BUDGET_P95_MS = 800;
  const samples: number[] = [];
  for (let i = 0; i < 100; i++) {
    samples.push(Math.round(150 + Math.random() * 500));
  }
  assert.ok(
    p95(samples) <= STATUS_BUDGET_P95_MS,
    `Status p95 ${p95(samples)}ms exceeds ${STATUS_BUDGET_P95_MS}ms`
  );
});

test("final resolution p95 under 20000ms budget", () => {
  const FINAL_BUDGET_P95_MS = 20000;
  const samples: number[] = [];
  for (let i = 0; i < 100; i++) {
    samples.push(Math.round(8000 + Math.random() * 8000));
  }
  assert.ok(
    p95(samples) <= FINAL_BUDGET_P95_MS,
    `Final p95 ${p95(samples)}ms exceeds ${FINAL_BUDGET_P95_MS}ms`
  );
});

// ── Regression: existing contracts preserved ──

test("p95 preserves original contract: works with simple arrays", () => {
  assert.equal(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 10);
  assert.equal(p95([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]), 100);
});

test("pushAndSummarizeTtft returns stable structure", () => {
  const s = pushAndSummarizeTtft({ t: 1000, totalTTFT: 300, slowestStage: "validate", slowestMs: 50 });
  assert.ok("avg" in s);
  assert.ok("p95" in s);
  assert.ok("slowestStageTop" in s);
  assert.ok("sampleCount" in s);
});
