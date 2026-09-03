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
    "用户位置[B1_SafeZone]",
    "无关描述一大段",
    "游戏时间[Day 2 / 08:00]",
  ].join("\n"));
  assert.match(snapshot, /用户位置/);
  assert.match(snapshot, /游戏时间/);
});

test("dedupeDecisionOptions removes exact duplicates and short fillers", () => {
  const deduped = dedupeDecisionOptions(["观察门缝", "观察门缝", "观察，门缝", "好", "转身离开"]);
  assert.deepEqual(deduped, ["观察门缝", "转身离开"]);
});

test("inferPlannedTurnMode prefers opening constraint and director tension", () => {
  assert.deepEqual(
    inferPlannedTurnMode({
      latestUserInput: "继续",
      shouldApplyFirstActionConstraint: true,
      clientState: {},
      pipelineControl: null,
    }),
    { mode: "decision_required", reason: "opening_first_action_constraint" }
  );

  const byTension = inferPlannedTurnMode({
    latestUserInput: "继续向前",
    shouldApplyFirstActionConstraint: false,
    clientState: { directorDigest: { tension: 90 } },
    pipelineControl: null,
  });
  assert.equal(byTension.mode, "decision_required");

  assert.deepEqual(
    inferPlannedTurnMode({
      latestUserInput: "进入结算",
      shouldApplyFirstActionConstraint: false,
      clientState: {},
      pipelineControl: null,
    }),
    { mode: "system_transition", reason: "input_transition_command" },
  );
});

test("parseUpstreamErrorFields extracts json body message and code", () => {
  const parsed = parseUpstreamErrorFields('{"error":{"message":"model missing","code":"bad_model"}}');
  assert.equal(parsed.upstreamHint, "model missing");
  assert.equal(parsed.upstreamCode, "bad_model");
});
