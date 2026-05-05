import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDauWauMau,
  computeFunnel,
  computeAdjacentFunnelStages,
  computeRetention,
  computeTokenStats,
  decodeCursor,
  encodeCursor,
  hasSufficientSample,
  isOnline,
  percentile,
  safeRate,
  splitSessionsByInactivity,
} from "@/lib/admin/metricsUtils";

test("computeDauWauMau should count unique users in windows", () => {
  const points = [
    { userId: "u1", dateKey: "2026-03-10" },
    { userId: "u1", dateKey: "2026-03-10" },
    { userId: "u2", dateKey: "2026-03-09" },
    { userId: "u3", dateKey: "2026-02-20" },
  ];
  const r = computeDauWauMau(points, "2026-03-10");
  assert.equal(r.dau, 1);
  assert.equal(r.wau, 2);
  assert.equal(r.mau, 3);
});

test("computeRetention should handle D1 D3 D7 and empty history", () => {
  const cohort = [
    { userId: "u1", registerDateKey: "2026-03-01" },
    { userId: "u2", registerDateKey: "2026-03-01" },
  ];
  const active = [
    { userId: "u1", dateKey: "2026-03-02" },
    { userId: "u1", dateKey: "2026-03-04" },
    { userId: "u2", dateKey: "2026-03-08" },
  ];
  const r = computeRetention(cohort, active);
  assert.equal(r.cohortSize, 2);
  assert.equal(r.d1, 1);
  assert.equal(r.d3, 1);
  assert.equal(r.d7, 1);
});

test("splitSessionsByInactivity should dedupe repeated events", () => {
  const sessions = splitSessionsByInactivity(
    [
      { userId: "u1", eventTime: "2026-03-10T00:00:00.000Z", idempotencyKey: "a" },
      { userId: "u1", eventTime: "2026-03-10T00:00:00.000Z", idempotencyKey: "a" },
      { userId: "u1", eventTime: "2026-03-10T00:20:00.000Z", idempotencyKey: "b" },
      { userId: "u1", eventTime: "2026-03-10T01:10:00.000Z", idempotencyKey: "c" },
    ],
    30
  );
  assert.equal(sessions.u1?.length, 2);
  assert.equal(sessions.u1?.[0]?.count, 2);
});

test("isOnline should return false for invalid and outdated timestamps", () => {
  const now = new Date("2026-03-10T10:00:00.000Z");
  assert.equal(isOnline("invalid", now, 10 * 60_000), false);
  assert.equal(isOnline("2026-03-10T09:40:00.000Z", now, 10 * 60_000), false);
  assert.equal(isOnline("2026-03-10T09:52:00.000Z", now, 10 * 60_000), true);
});

test("computeFunnel should return conversion from first stage", () => {
  const stages = computeFunnel(["register", "create", "enter"], { register: 100, create: 75, enter: 50 });
  assert.equal(stages[0]?.conversionRate, 1);
  assert.equal(stages[1]?.conversionRate, 0.75);
  assert.equal(stages[2]?.conversionRate, 0.5);
});

test("computeTokenStats should guard divide by zero", () => {
  assert.equal(computeTokenStats(1000, 0).tokenPerActive, 0);
  assert.equal(computeTokenStats(1000, 20).tokenPerActive, 50);
});

test("safeRate and sample sufficiency should avoid invented trends", () => {
  assert.equal(safeRate(5, 10), 0.5);
  assert.equal(safeRate(5, 0), 0);
  assert.equal(hasSufficientSample(19), false);
  assert.equal(hasSufficientSample(20), true);
});

test("percentile should interpolate sorted values", () => {
  assert.equal(percentile([30, 10, 20], 0.5), 20);
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([0, 100], 0.95), 95);
});

test("computeAdjacentFunnelStages should expose step and total conversion", () => {
  const stages = computeAdjacentFunnelStages(["home", "create", "enter"], {
    home: 100,
    create: 50,
    enter: 25,
  });
  assert.equal(stages[0]?.stepConversionRate, 1);
  assert.equal(stages[1]?.stepConversionRate, 0.5);
  assert.equal(stages[2]?.stepConversionRate, 0.5);
  assert.equal(stages[2]?.totalConversionRate, 0.25);
});

test("cursor helpers should round trip JSON-safe cursor parts", () => {
  const cursor = encodeCursor(["2026-05-05T00:00:00.000Z", 42]);
  assert.deepEqual(decodeCursor(cursor), ["2026-05-05T00:00:00.000Z", 42]);
  assert.equal(decodeCursor("bad-cursor"), null);
});

test("timezone cross-day should be treated in UTC", () => {
  const sessions = splitSessionsByInactivity(
    [
      { userId: "u1", eventTime: "2026-03-10T23:59:00.000Z" },
      { userId: "u1", eventTime: "2026-03-11T00:02:00.000Z" },
    ],
    10
  );
  assert.equal(sessions.u1?.length, 1);
});

