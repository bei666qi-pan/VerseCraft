import test from "node:test";
import assert from "node:assert/strict";
import { formatDurationHoursMinutes } from "@/lib/admin/timeFormat";

test("formatDurationHoursMinutes: less than one hour shows minutes only", () => {
  assert.equal(formatDurationHoursMinutes(59), "0分");
  assert.equal(formatDurationHoursMinutes(60), "1分");
  assert.equal(formatDurationHoursMinutes(3599), "59分");
});

test("formatDurationHoursMinutes: hour and minute positions are stable", () => {
  assert.equal(formatDurationHoursMinutes(3600), "1小时0分");
  assert.equal(formatDurationHoursMinutes(3660), "1小时1分");
  assert.equal(formatDurationHoursMinutes(5400), "1小时30分");
});
