import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMinimalPlayerContextSnapshot,
  dedupeDecisionOptions,
  inferPlannedTurnMode,
  parseUpstreamErrorFields,
} from "@/lib/turnEngine/requestMetadata";

test("buildMinimalPlayerContextSnapshot keeps high signal lines", () => {
  const snapshot = buildMinimalPlayerContextSnapshot([
    "鐢ㄦ埛浣嶇疆[B1_SafeZone]",
    "鏃犲叧鎻忚堪涓€澶ф",
    "娓告垙鏃堕棿[Day 2 / 08:00]",
  ].join("\n"));
  assert.match(snapshot, /鐢ㄦ埛浣嶇疆/);
  assert.match(snapshot, /娓告垙鏃堕棿/);
});

test("dedupeDecisionOptions removes exact duplicates and short fillers", () => {
  const deduped = dedupeDecisionOptions(["瑙傚療闂ㄧ紳", "瑙傚療闂ㄧ紳", "濂", "杞韩绂诲紑"]);
  assert.deepEqual(deduped, ["瑙傚療闂ㄧ紳", "杞韩绂诲紑"]);
});

test("inferPlannedTurnMode prefers opening constraint and director tension", () => {
  assert.deepEqual(
    inferPlannedTurnMode({
      latestUserInput: "缁х画",
      shouldApplyFirstActionConstraint: true,
      clientState: {},
      pipelineControl: null,
    }),
    { mode: "decision_required", reason: "opening_first_action_constraint" }
  );

  const byTension = inferPlannedTurnMode({
    latestUserInput: "缁х画鍚戝墠",
    shouldApplyFirstActionConstraint: false,
    clientState: { directorDigest: { tension: 90 } },
    pipelineControl: null,
  });
  assert.equal(byTension.mode, "decision_required");
});

test("parseUpstreamErrorFields extracts json body message and code", () => {
  const parsed = parseUpstreamErrorFields('{"error":{"message":"model missing","code":"bad_model"}}');
  assert.equal(parsed.upstreamHint, "model missing");
  assert.equal(parsed.upstreamCode, "bad_model");
});
