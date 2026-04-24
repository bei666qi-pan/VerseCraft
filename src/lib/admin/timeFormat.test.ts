import test from "node:test";
import assert from "node:assert/strict";
import { formatDurationHoursMinutes } from "@/lib/admin/timeFormat";

test("formatDurationHoursMinutes: less than one hour shows minutes only", () => {
  assert.equal(formatDurationHoursMinutes(59), "0 分");
  assert.equal(formatDurationHoursMinutes(60), "1 分");
  assert.equal(formatDurationHoursMinutes(3599), "59 分");
});

test("formatDurationHoursMinutes: hour and minute positions are stable", () => {
  assert.equal(formatDurationHoursMinutes(3600), "1 小时 0 分");
  assert.equal(formatDurationHoursMinutes(3660), "1 小时 1 分");
  assert.equal(formatDurationHoursMinutes(5400), "1 小时 30 分");
});
