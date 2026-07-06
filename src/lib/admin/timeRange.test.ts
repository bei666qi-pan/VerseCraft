import test from "node:test";
import assert from "node:assert/strict";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { addAppDays, appEndOfDayUtc, appStartOfDayUtc } from "@/lib/admin/appTimezone";

function params(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj);
}

test("custom range with valid start/end computes deterministic Beijing-aligned instants", () => {
  const range = parseAdminTimeRangeFromSearchParams(params({ range: "custom", start: "2026-07-01", end: "2026-07-03" }));
  assert.equal(range.preset, "custom");
  assert.equal(range.requestedPreset, "custom");
  assert.equal(range.customRangeFallback, false);
  // 北京 2026-07-01 00:00 = UTC 2026-06-30T16:00:00.000Z
  assert.equal(range.start.toISOString(), "2026-06-30T16:00:00.000Z");
  // 北京 2026-07-03 23:59:59.999 = UTC 2026-07-03T15:59:59.999Z
  assert.equal(range.end.toISOString(), "2026-07-03T15:59:59.999Z");
  assert.equal(range.label, "2026-07-01 ~ 2026-07-03");
  // date_key 沿用既有 UTC 自然日约定。
  assert.equal(range.startDateKey, "2026-07-01");
  assert.equal(range.endDateKey, "2026-07-03");
});

test("custom range missing params falls back to 7d and reports the fallback honestly", () => {
  const range = parseAdminTimeRangeFromSearchParams(params({ range: "custom" }));
  assert.equal(range.requestedPreset, "custom");
  assert.equal(range.preset, "7d");
  assert.equal(range.customRangeFallback, true);
  assert.match(range.label, /近7天/);
});

test("custom range with start after end falls back to 7d", () => {
  const range = parseAdminTimeRangeFromSearchParams(params({ range: "custom", start: "2026-07-05", end: "2026-07-01" }));
  assert.equal(range.preset, "7d");
  assert.equal(range.customRangeFallback, true);
});

test("custom range with malformed date strings falls back to 7d", () => {
  const range = parseAdminTimeRangeFromSearchParams(params({ range: "custom", start: "not-a-date", end: "2026-07-01" }));
  assert.equal(range.preset, "7d");
  assert.equal(range.customRangeFallback, true);
});

test("unknown range preset defaults to 7d without a fallback flag (it was never a valid preset to begin with)", () => {
  const range = parseAdminTimeRangeFromSearchParams(params({ range: "bogus" }));
  assert.equal(range.preset, "7d");
  assert.equal(range.requestedPreset, "7d");
  assert.equal(range.customRangeFallback, false);
});

test("today preset aligns start/end to the Beijing calendar day (not raw UTC)", () => {
  const range = parseAdminTimeRangeFromSearchParams(params({ range: "today" }));
  const now = new Date();
  assert.equal(range.start.getTime(), appStartOfDayUtc(now).getTime());
  assert.equal(range.end.getTime(), appEndOfDayUtc(now).getTime());
});

test("yesterday preset is exactly one Beijing calendar day before today", () => {
  const range = parseAdminTimeRangeFromSearchParams(params({ range: "yesterday" }));
  const now = new Date();
  const expectedStart = addAppDays(appStartOfDayUtc(now), -1);
  const expectedEnd = addAppDays(appEndOfDayUtc(now), -1);
  assert.equal(range.start.getTime(), expectedStart.getTime());
  assert.equal(range.end.getTime(), expectedEnd.getTime());
});

test("7d preset spans exactly 7 Beijing calendar days ending today", () => {
  const range = parseAdminTimeRangeFromSearchParams(params({ range: "7d" }));
  const now = new Date();
  const expectedStart = addAppDays(appStartOfDayUtc(now), -6);
  assert.equal(range.start.getTime(), expectedStart.getTime());
  assert.equal(range.end.getTime(), appEndOfDayUtc(now).getTime());
  // 7 个完整北京自然日：从 day-6 的 00:00:00.000 到 day 的 23:59:59.999。
  assert.equal(range.end.getTime() - range.start.getTime(), 7 * 24 * 60 * 60 * 1000 - 1);
});

test("30d preset spans exactly 30 Beijing calendar days ending today", () => {
  const range = parseAdminTimeRangeFromSearchParams(params({ range: "30d" }));
  const now = new Date();
  const expectedStart = addAppDays(appStartOfDayUtc(now), -29);
  assert.equal(range.start.getTime(), expectedStart.getTime());
  assert.equal(range.end.getTime() - range.start.getTime(), 30 * 24 * 60 * 60 * 1000 - 1);
});

test("default range (no query params) behaves like 7d", () => {
  const range = parseAdminTimeRangeFromSearchParams(params({}));
  assert.equal(range.preset, "7d");
  assert.equal(range.label, "近7天");
});
