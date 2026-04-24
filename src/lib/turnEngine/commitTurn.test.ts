import test from "node:test";
import assert from "node:assert/strict";
import { commitTurn } from "@/lib/turnEngine/commitTurn";
import { emptyStateDelta } from "@/lib/turnEngine/computeStateDelta";
import type { NarrativeValidationReport } from "@/lib/turnEngine/validateNarrative";

function okReport(): NarrativeValidationReport {
  return {
    ok: true,
    issues: [],
    optionsOverride: null,
    narrativeOverride: null,
    telemetry: {
      totalIssues: 0,
      byCode: {},
      optionsOverrideApplied: false,
      safeNarrativeFallbackApplied: false,
    },
  };
}

test("commitTurn passes through when validator reports ok", () => {
  const candidate = {
    narrative: "你穿过走廊。",
    options: ["继续", "停下", "回头", "观察"],
    player_location: "二楼走廊",
  };
  const result = commitTurn({
    requestId: "req_1",
    sessionId: "s_1",
    turnIndex: 3,
    candidateDmRecord: candidate,
    delta: { ...emptyStateDelta(), isActionLegal: true, playerLocation: "二楼走廊", consumesTime: true },
    validatorReport: okReport(),
  });
  assert.equal(result.summary.optionsRewriteApplied, false);
  assert.equal(result.summary.safeNarrativeFallbackApplied, false);
  assert.deepEqual(result.committedDmRecord.options, candidate.options);
  assert.equal((result.committedDmRecord.security_meta as any).turn_commit.issues, 0);
  // Input record is not mutated.
  assert.equal((candidate as any).security_meta, undefined);
});

test("commitTurn applies options override", () => {
  const candidate = {
    narrative: "...",
    options: ["攻击", "攻击"],
    player_location: "地下室",
  };
  const report: NarrativeValidationReport = {
    ok: false,
    issues: [],
    optionsOverride: ["观察", "退后", "记录", "思考"],
    narrativeOverride: null,
    telemetry: {
      totalIssues: 1,
      byCode: { options_duplicate_only: 1 },
      optionsOverrideApplied: true,
      safeNarrativeFallbackApplied: false,
    },
  };
  const result = commitTurn({
    requestId: "req_2",
    sessionId: "s_1",
    turnIndex: 7,
    candidateDmRecord: candidate,
    delta: { ...emptyStateDelta(), isActionLegal: true, playerLocation: "地下室" },
    validatorReport: report,
  });
  assert.deepEqual(result.committedDmRecord.options, ["观察", "退后", "记录", "思考"]);
  assert.equal(result.summary.optionsRewriteApplied, true);
  assert.equal(result.summary.safeNarrativeFallbackApplied, false);
  assert.equal(result.summary.degraded, false);
});

test("commitTurn falls back to safe narrative when override present", () => {
  const candidate = {
    narrative: "禁忌内容。",
    options: ["a", "b", "c", "d"],
    player_location: "三楼走廊",
  };
  const report: NarrativeValidationReport = {
    ok: false,
    issues: [],
    optionsOverride: null,
    narrativeOverride: JSON.stringify({
      is_action_legal: false,
      sanity_damage: 1,
      narrative: "你忽然有些头晕，先按下心神。",
      options: ["a2", "b2", "c2", "d2"],
      security_meta: { action: "degrade", stage: "post_model", risk_level: "gray", reason: "x" },
    }),
    telemetry: {
      totalIssues: 1,
      byCode: { dm_only_fact_leaked_in_narrative: 1 },
      optionsOverrideApplied: false,
      safeNarrativeFallbackApplied: true,
    },
  };
  const result = commitTurn({
    requestId: "req_3",
    sessionId: null,
    turnIndex: 1,
    candidateDmRecord: candidate,
    delta: { ...emptyStateDelta(), isActionLegal: true, mustDegrade: false, playerLocation: "三楼走廊" },
    validatorReport: report,
  });
  assert.equal(result.committedDmRecord.narrative, "你忽然有些头晕，先按下心神。");
  assert.equal(result.summary.safeNarrativeFallbackApplied, true);
  assert.equal(result.summary.degraded, true);
  // Preserved fields from the original.
  assert.equal(result.committedDmRecord.player_location, "三楼走廊");
});

test("commitTurn summary captures delta shape for analytics", () => {
  const delta = {
    ...emptyStateDelta(),
    consumesTime: true,
    timeCost: "heavy" as const,
    sanityDamage: 3,
    hpDelta: -5,
    originiumDelta: 10,
    isDeath: false,
    playerLocation: "废弃电梯",
    npcLocationUpdates: [{ npcId: "N-001", location: "大厅" }],
    npcAttitudeUpdates: [],
    taskUpdates: [{ taskId: "T_001", status: "in_progress" }],
    newTasks: [{ taskId: "T_002", title: "调查" }],
    isActionLegal: true,
    illegalReasons: [],
  };
  const result = commitTurn({
    requestId: "req_4",
    sessionId: "s_x",
    turnIndex: 12,
    candidateDmRecord: { narrative: "...", options: ["a", "b", "c", "d"], player_location: "废弃电梯" },
    delta,
    validatorReport: okReport(),
  });
  assert.equal(result.summary.deltaSummary.sanityDamage, 3);
  assert.equal(result.summary.deltaSummary.hpDelta, -5);
  assert.equal(result.summary.deltaSummary.originiumDelta, 10);
  assert.equal(result.summary.deltaSummary.npcLocationUpdates, 1);
  assert.equal(result.summary.deltaSummary.taskUpdates, 1);
  assert.equal(result.summary.deltaSummary.newTasks, 1);
  assert.equal(result.summary.deltaSummary.timeCost, "heavy");
  assert.equal(result.summary.playerLocation, "废弃电梯");
});

test("commitTurn preserves existing security_meta keys", () => {
  const candidate = {
    narrative: "...",
    options: ["a", "b", "c", "d"],
    player_location: "二楼",
    security_meta: { earlier_stage: "input_ok" },
  };
  const result = commitTurn({
    requestId: "req_5",
    sessionId: "s_1",
    turnIndex: 2,
    candidateDmRecord: candidate,
    delta: { ...emptyStateDelta(), isActionLegal: true },
    validatorReport: okReport(),
  });
  const meta = result.committedDmRecord.security_meta as Record<string, unknown>;
  assert.equal(meta.earlier_stage, "input_ok");
  assert.ok(meta.turn_commit);
});
