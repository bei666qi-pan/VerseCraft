import test from "node:test";
import assert from "node:assert/strict";
import {
  DURATION_DB_FIELD_UNITS,
  formatDurationSeconds,
  formatPlayTimeFromDbSeconds,
  secondsToHours,
  secondsToMinutes,
} from "@/lib/time/durationUnits";

test("duration DB fields are explicitly seconds", () => {
  assert.deepEqual(DURATION_DB_FIELD_UNITS, {
    "users.playTime": "SECONDS",
    "users.todayPlayTime": "SECONDS",
    "user_sessions.total_play_duration_sec": "SECONDS",
    "user_daily_tokens.daily_play_duration_sec": "SECONDS",
    "admin_metrics_daily.total_play_duration_sec": "SECONDS",
  });
});

test("formatDurationSeconds: hms boundary values", () => {
  assert.equal(formatDurationSeconds(0), "0 秒");
  assert.equal(formatDurationSeconds(59), "59 秒");
  assert.equal(formatDurationSeconds(60), "1 分 0 秒");
  assert.equal(formatDurationSeconds(3599), "59 分 59 秒");
  assert.equal(formatDurationSeconds(3600), "1 小时 0 分 0 秒");
  assert.equal(formatDurationSeconds(3661), "1 小时 1 分 1 秒");
  assert.equal(formatDurationSeconds(86400), "24 小时 0 分 0 秒");
});

test("formatDurationSeconds: non-finite and negative values become zero", () => {
  assert.equal(formatDurationSeconds(Number.NaN), "0 秒");
  assert.equal(formatDurationSeconds(Number.POSITIVE_INFINITY), "0 秒");
  assert.equal(formatDurationSeconds(-1), "0 秒");
});

test("formatDurationSeconds: h_m drops seconds for coarse cards", () => {
  assert.equal(formatDurationSeconds(59, { style: "h_m" }), "0 分");
  assert.equal(formatDurationSeconds(60, { style: "h_m" }), "1 分");
  assert.equal(formatDurationSeconds(3661, { style: "h_m" }), "1 小时 1 分");
});

test("formatDurationSeconds: compact_cn keeps Chinese units without spaces", () => {
  assert.equal(formatDurationSeconds(0, { style: "compact_cn" }), "0秒");
  assert.equal(formatDurationSeconds(60, { style: "compact_cn" }), "1分");
  assert.equal(formatDurationSeconds(3661, { style: "compact_cn" }), "1小时1分1秒");
});

test("secondsToMinutes floors and clamps display conversions", () => {
  assert.equal(secondsToMinutes(59), 0);
  assert.equal(secondsToMinutes(60), 1);
  assert.equal(secondsToMinutes(3599), 59);
  assert.equal(secondsToMinutes(Number.NaN), 0);
  assert.equal(secondsToMinutes(-60), 0);
});

test("secondsToHours floors and clamps display conversions", () => {
  assert.equal(secondsToHours(3599), 0);
  assert.equal(secondsToHours(3600), 1);
  assert.equal(secondsToHours(86400), 24);
  assert.equal(secondsToHours(Number.POSITIVE_INFINITY), 0);
  assert.equal(secondsToHours(-3600), 0);
  assert.equal(secondsToHours(Number.NEGATIVE_INFINITY), 0);
});

test("formatDurationSeconds truncates fractional seconds before display", () => {
  assert.equal(formatDurationSeconds(3661.9), "1 小时 1 分 1 秒");
});

test("formatPlayTimeFromDbSeconds coerces string and bad values", () => {
  assert.equal(formatPlayTimeFromDbSeconds("3661"), "1 小时 1 分 1 秒");
  assert.equal(formatPlayTimeFromDbSeconds(""), "0 秒");
  assert.equal(formatPlayTimeFromDbSeconds(undefined), "0 秒");
});

test("hms never swaps hour and minute for representative admin values", () => {
  // 90 minutes must not render as 1 分 30 时 — whole hours then remainder minutes.
  assert.equal(formatDurationSeconds(90 * 60), "1 小时 30 分 0 秒");
  assert.equal(formatDurationSeconds(2 * 3600 + 3 * 60 + 4), "2 小时 3 分 4 秒");
});
