import assert from "node:assert/strict";
import test from "node:test";
import { buildNarrativeRunMeta, logNarrativeRun } from "./runLogger";
import type { NarrativeRunInsertRow } from "./narrativeRunRepository";

test("buildNarrativeRunMeta normalizes observability fields", () => {
  const meta = buildNarrativeRunMeta({
    provider: { role: "main" },
    lane: "slow",
    dialogueContext: { degraded: true },
    modelOutputCheck: { issues: [{ code: "forbidden_fact_leak" }] },
    retrievalSourceCounts: { exact: 2 },
    modelParseFallback: "json_repair",
    committed: true,
    commitFlags: ["story_events_written"],
  });

  assert.equal(meta.providerRole, "main");
  assert.equal(meta.routeLane, "slow");
  assert.equal(meta.contextBuildDegrade, true);
  assert.deepEqual(meta.checkerIssues, [{ code: "forbidden_fact_leak" }]);
  assert.deepEqual(meta.loreRetrieval, { usedCounts: { exact: 2 }, hitCount: null });
  assert.equal(meta.modelParseFallback, "json_repair");
  assert.deepEqual(meta.commitResult, { committed: true, commitFlags: ["story_events_written"] });
});

test("logNarrativeRun writes narrative_runs best-effort payload", async () => {
  const upserted: NarrativeRunInsertRow[] = [];
  await logNarrativeRun({
    requestId: "req_log_1",
    sessionId: "sess_log_1",
    userId: "user_log_1",
    turnIndex: 6,
    ttftMs: 12.8,
    totalLatencyMs: 1200.2,
    loreHitCount: 3,
    validatorIssueCount: 1,
    degradeReason: "checker_degrade",
    commitFlags: ["story_events_written"],
    meta: {
      providerRole: "main",
      routeLane: "slow",
      checkerIssues: [{ code: "unknown_entity" }],
      commitResult: { committed: true },
    },
    deps: {
      upsert: async (row) => {
        upserted.push(row);
      },
    },
  });

  const row = upserted[0];
  assert.ok(row);
  assert.equal(row.requestId, "req_log_1");
  assert.equal(row.turnIndex, 6);
  assert.equal(row.ttftMs, 12);
  assert.equal(row.totalLatencyMs, 1200);
  assert.equal(row.validatorIssueCount, 1);
  assert.equal(row.degradeReason, "checker_degrade");
  assert.deepEqual(row.commitFlags, ["story_events_written"]);
  assert.equal((row.meta as Record<string, unknown>).providerRole, "main");
  assert.equal((row.meta as Record<string, unknown>).routeLane, "slow");
});

test("logNarrativeRun swallows repository failures", async () => {
  await logNarrativeRun({
    requestId: "req_log_2",
    sessionId: null,
    userId: null,
    turnIndex: 1,
    deps: {
      upsert: async () => {
        throw new Error("db unavailable");
      },
      warn: () => undefined,
    },
  });

  assert.ok(true);
});

