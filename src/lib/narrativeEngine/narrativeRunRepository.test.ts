import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNarrativeRunInsertRow,
  writeNarrativeRunBestEffort,
  type NarrativeRunInsertRow,
} from "./narrativeRunRepository";

test("buildNarrativeRunInsertRow applies run defaults and integer coercion", () => {
  const row = buildNarrativeRunInsertRow({
    requestId: "req_run_1",
    ttftMs: 12.9,
    totalLatencyMs: Number.NaN,
  });

  assert.equal(row.sessionId, null);
  assert.equal(row.userId, null);
  assert.equal(row.turnIndex, 0);
  assert.equal(row.ttftMs, 12);
  assert.equal(row.totalLatencyMs, null);
  assert.equal(row.loreHitCount, 0);
  assert.equal(row.validatorIssueCount, 0);
  assert.equal(row.degradeReason, null);
  assert.deepEqual(row.commitFlags, []);
  assert.deepEqual(row.meta, {});
});

test("writeNarrativeRunBestEffort delegates upsert without touching real DB", async () => {
  const upserted: NarrativeRunInsertRow[] = [];
  const result = await writeNarrativeRunBestEffort(
    {
      requestId: "req_run_2",
      sessionId: "sess_2",
      userId: "user_2",
      turnIndex: 7,
      ttftMs: 101,
      totalLatencyMs: 1500,
      loreHitCount: 4,
      validatorIssueCount: 2,
      degradeReason: "validator_degrade",
      commitFlags: ["safe_narrative_fallback"],
      meta: { lane: "slow" },
    },
    {
      upsert: async (row) => {
        upserted.push(row);
      },
    }
  );

  const row = upserted[0];
  assert.ok(row);
  assert.deepEqual(result, { ok: true });
  assert.equal(row.requestId, "req_run_2");
  assert.equal(row.turnIndex, 7);
  assert.deepEqual(row.commitFlags, ["safe_narrative_fallback"]);
  assert.deepEqual(row.meta, { lane: "slow" });
});

test("writeNarrativeRunBestEffort returns failure instead of throwing", async () => {
  const error = new Error("unique index missing");
  const warnings: Array<{ reason: string; error: unknown }> = [];

  const result = await writeNarrativeRunBestEffort(
    { requestId: "req_run_3" },
    {
      upsert: async () => {
        throw error;
      },
      warn: (reason, caught) => {
        warnings.push({ reason, error: caught });
      },
    }
  );

  assert.deepEqual(result, { ok: false, reason: "unique index missing" });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.error, error);
});
