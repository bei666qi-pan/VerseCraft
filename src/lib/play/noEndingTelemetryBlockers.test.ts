import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTelemetrySurvivalHours, buildNoEndingTelemetryBlockers } from "./noEndingTelemetryBlockers";

test("computeTelemetrySurvivalHours：day/hour 折算为累计小时数", () => {
  assert.equal(computeTelemetrySurvivalHours({ day: 0, hour: 0 }), 0);
  assert.equal(computeTelemetrySurvivalHours({ day: 1, hour: 5 }), 29);
  assert.equal(computeTelemetrySurvivalHours({ day: 10, hour: 0 }), 240);
});

test("computeTelemetrySurvivalHours：缺失/非法输入按 0 处理，不抛错", () => {
  assert.equal(computeTelemetrySurvivalHours(null), 0);
  assert.equal(computeTelemetrySurvivalHours(undefined), 0);
  assert.equal(computeTelemetrySurvivalHours({}), 0);
  assert.equal(computeTelemetrySurvivalHours({ day: -5, hour: -3 }), 0, "负数应裁剪到 0");
  assert.equal(computeTelemetrySurvivalHours({ day: Number.NaN, hour: 2 }), 2);
});

test("buildNoEndingTelemetryBlockers：全部条件均未满足时返回全部 4 个 blocker", () => {
  const blockers = buildNoEndingTelemetryBlockers(
    { stats: { sanity: 5 }, time: { day: 1, hour: 0 }, escapeMainline: { stage: "in_progress" } },
    { is_death: false }
  );
  assert.deepEqual(blockers.sort(), [
    "doom_time_not_reached",
    "escape_stage_not_terminal",
    "resolved_turn_not_death",
    "sanity_above_zero",
  ]);
});

test("buildNoEndingTelemetryBlockers：sanity<=0 时不再阻止（不含 sanity_above_zero）", () => {
  const blockers = buildNoEndingTelemetryBlockers(
    { stats: { sanity: 0 }, time: { day: 1, hour: 0 }, escapeMainline: { stage: "in_progress" } },
    { is_death: false }
  );
  assert.ok(!blockers.includes("sanity_above_zero"));
});

test("buildNoEndingTelemetryBlockers：resolvedTurn.is_death=true 时不再阻止", () => {
  const blockers = buildNoEndingTelemetryBlockers(
    { stats: { sanity: 0 }, time: { day: 1, hour: 0 }, escapeMainline: { stage: "in_progress" } },
    { is_death: true }
  );
  assert.ok(!blockers.includes("resolved_turn_not_death"));
});

test("buildNoEndingTelemetryBlockers：escapeMainline.stage 以 escaped_ 开头时不再阻止", () => {
  const blockers = buildNoEndingTelemetryBlockers(
    { stats: { sanity: 0 }, time: { day: 1, hour: 0 }, escapeMainline: { stage: "escaped_main_exit" } },
    { is_death: true }
  );
  assert.ok(!blockers.includes("escape_stage_not_terminal"));
});

test("buildNoEndingTelemetryBlockers：累计生存 >= 240 小时或 day >= 10 时不再阻止 doom_time", () => {
  const byHours = buildNoEndingTelemetryBlockers(
    { stats: { sanity: 0 }, time: { day: 9, hour: 25 }, escapeMainline: { stage: "escaped_x" } },
    { is_death: true }
  );
  assert.ok(!byHours.includes("doom_time_not_reached"));

  const byDay = buildNoEndingTelemetryBlockers(
    { stats: { sanity: 0 }, time: { day: 10, hour: 0 }, escapeMainline: { stage: "escaped_x" } },
    { is_death: true }
  );
  assert.ok(!byDay.includes("doom_time_not_reached"));
});

test("buildNoEndingTelemetryBlockers：所有条件均满足时返回 no_ending_conditions_met 占位", () => {
  const blockers = buildNoEndingTelemetryBlockers(
    { stats: { sanity: 0 }, time: { day: 10, hour: 0 }, escapeMainline: { stage: "escaped_main_exit" } },
    { is_death: true }
  );
  assert.deepEqual(blockers, ["no_ending_conditions_met"]);
});

test("buildNoEndingTelemetryBlockers：state/resolvedTurn 为 null/undefined 时不抛错，按最保守情况处理", () => {
  const blockers = buildNoEndingTelemetryBlockers(null, undefined);
  assert.ok(blockers.includes("sanity_above_zero") === false, "sanity 缺失按 0 处理，不算阻止");
  assert.ok(blockers.includes("resolved_turn_not_death"));
  assert.ok(blockers.includes("escape_stage_not_terminal"));
  assert.ok(blockers.includes("doom_time_not_reached"));
});
