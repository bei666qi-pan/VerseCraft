import test from "node:test";
import assert from "node:assert/strict";
import { createChatTtftProfile, p95, pushAndSummarizeTtft } from "@/lib/turnEngine/chatPerf";

test("createChatTtftProfile seeds nullable timings", () => {
  const profile = createChatTtftProfile({ requestReceivedAt: 10, jsonParseMs: 5 });
  assert.equal(profile.requestReceivedAt, 10);
  assert.equal(profile.jsonParseMs, 5);
  assert.equal(profile.firstSseWriteAt, null);
  assert.equal(profile.lane, "slow");
});

test("p95 returns upper percentile for sorted sample", () => {
  assert.equal(p95([1, 2, 3, 4, 100]), 100);
});

test("pushAndSummarizeTtft aggregates latest samples", () => {
  const summary = pushAndSummarizeTtft({
    t: Date.now(),
    totalTTFT: 120,
    slowestStage: "prompt_build",
    slowestMs: 40,
  });
  assert.equal(summary.sampleCount >= 1, true);
  assert.equal(summary.slowestStageTop.length > 0, true);
});
