import test from "node:test";
import assert from "node:assert/strict";
import { addAppDays, appDateLabel, appEndOfDayUtc, appStartOfDayUtc } from "@/lib/admin/appTimezone";

test("appStartOfDayUtc/appEndOfDayUtc align to Beijing (UTC+8) calendar day for a mid-day instant", () => {
  // 2026-07-06T02:00:00Z = 北京 2026-07-06 10:00，清楚落在北京 7 月 6 日当天。
  const d = new Date("2026-07-06T02:00:00.000Z");
  assert.equal(appStartOfDayUtc(d).toISOString(), "2026-07-05T16:00:00.000Z");
  assert.equal(appEndOfDayUtc(d).toISOString(), "2026-07-06T15:59:59.999Z");
});

test("appStartOfDayUtc correctly rolls to the next Beijing day during UTC late-evening (root-cause regression case)", () => {
  // 2026-07-06T20:00:00Z = 北京 2026-07-07 04:00：UTC 日历日还是7月6日，但北京已经是7月7日凌晨。
  // 修复前的纯 UTC 实现会把"今日"错误算成 UTC 7月6日 00:00-24:00（对应北京 7月6日08:00 到
  // 7月7日08:00），导致北京 0-8 点期间"今日"窗口实际还是昨天的数据。
  const d = new Date("2026-07-06T20:00:00.000Z");
  assert.equal(appStartOfDayUtc(d).toISOString(), "2026-07-06T16:00:00.000Z", "应对齐北京7月7日00:00，而不是UTC7月6日00:00");
  assert.equal(appEndOfDayUtc(d).toISOString(), "2026-07-07T15:59:59.999Z");
  // 验证这一刻确实落在新计算出的"今日"窗口内。
  assert.ok(d.getTime() >= appStartOfDayUtc(d).getTime());
  assert.ok(d.getTime() <= appEndOfDayUtc(d).getTime());
});

test("addAppDays rolls over month/year boundaries correctly in Beijing calendar", () => {
  const jan31 = new Date("2026-01-31T10:00:00.000Z"); // 北京 2026-01-31 18:00
  const start = appStartOfDayUtc(jan31);
  assert.equal(appDateLabel(start), "2026-01-31");
  const nextDay = addAppDays(start, 1);
  assert.equal(appDateLabel(nextDay), "2026-02-01");

  const dec31 = new Date("2026-12-31T10:00:00.000Z");
  const decStart = appStartOfDayUtc(dec31);
  const newYear = addAppDays(decStart, 1);
  assert.equal(appDateLabel(newYear), "2027-01-01");
});

test("addAppDays with negative delta moves backward across a month boundary", () => {
  const mar1 = appStartOfDayUtc(new Date("2026-03-01T03:00:00.000Z")); // 北京 2026-03-01 11:00
  const prevDay = addAppDays(mar1, -1);
  assert.equal(appDateLabel(prevDay), "2026-02-28");
});

test("appDateLabel returns a Beijing YYYY-MM-DD label independent of UTC calendar date", () => {
  // 2026-07-06T20:00:00Z 的 UTC 日期是 07-06，但北京日期是 07-07。
  assert.equal(appDateLabel(new Date("2026-07-06T20:00:00.000Z")), "2026-07-07");
});
