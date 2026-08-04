/**
 * Stale Dataset Guard 单元测试
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  checkStaleDataset,
  checkGoldSetStaleness,
  warnIfStale,
  DEFAULT_STALE_DAYS,
} from "./staleDatasetGuard";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * ONE_DAY_MS).toISOString();
}

// ── checkStaleDataset ─────────────────────────────────────────────

test("checkStaleDataset: returns not stale when updated today", () => {
  const result = checkStaleDataset("test-ds", daysAgo(0), 14);
  assert.equal(result.isStale, false);
  assert.equal(result.warning, null);
  assert.equal(result.daysSinceUpdate, 0);
});

test("checkStaleDataset: returns not stale within threshold", () => {
  const result = checkStaleDataset("test-ds", daysAgo(10), 14);
  assert.equal(result.isStale, false);
  assert.equal(result.warning, null);
  assert.equal(result.daysSinceUpdate, 10);
});

test("checkStaleDataset: returns stale when exceeds threshold", () => {
  const result = checkStaleDataset("test-ds", daysAgo(15), 14);
  assert.equal(result.isStale, true);
  assert.ok(result.warning!.includes("15 天未更新"));
  assert.equal(result.daysSinceUpdate, 15);
});

test("checkStaleDataset: uses DEFAULT_STALE_DAYS when not specified", () => {
  const recent = daysAgo(1);
  const old = daysAgo(DEFAULT_STALE_DAYS + 1);
  assert.equal(checkStaleDataset("a", recent).isStale, false);
  assert.equal(checkStaleDataset("b", old).isStale, true);
});

test("checkStaleDataset: handles invalid lastUpdated gracefully", () => {
  const result = checkStaleDataset("bad-ds", "not-a-date", 14);
  assert.equal(result.isStale, true);
  assert.equal(result.daysSinceUpdate, -1);
  assert.ok(result.warning!.includes("无法解析"));
});

test("checkStaleDataset: respects custom staleDays threshold", () => {
  const sevenDays = daysAgo(7);
  assert.equal(checkStaleDataset("a", sevenDays, 14).isStale, false);
  assert.equal(checkStaleDataset("b", sevenDays, 5).isStale, true);
});

test("checkStaleDataset: allows injection of now for deterministic testing", () => {
  const fixedNow = Date.parse("2026-07-24T00:00:00Z");
  const result = checkStaleDataset(
    "deterministic",
    "2026-07-10T00:00:00Z",
    14,
    fixedNow,
  );
  assert.equal(result.isStale, false);
  assert.equal(result.daysSinceUpdate, 14);
});

// ── checkGoldSetStaleness ──────────────────────────────────────────

test("checkGoldSetStaleness: extracts lastUpdated from metadata", () => {
  const metadata = { lastUpdated: daysAgo(3) };
  const result = checkGoldSetStaleness("gold-set.json", metadata, 14);
  assert.equal(result.isStale, false);
  assert.equal(result.daysSinceUpdate, 3);
});

test("checkGoldSetStaleness: returns stale when metadata is null", () => {
  const result = checkGoldSetStaleness("gold-set.json", null, 14);
  assert.equal(result.isStale, true);
  assert.ok(result.warning!.includes("缺少 lastUpdated"));
});

test("checkGoldSetStaleness: returns stale when metadata missing lastUpdated", () => {
  const result = checkGoldSetStaleness("gold-set.json", {}, 14);
  assert.equal(result.isStale, true);
  assert.ok(result.warning!.includes("缺少 lastUpdated"));
});

test("checkGoldSetStaleness: handles undefined metadata", () => {
  const result = checkGoldSetStaleness("gold-set.json", undefined, 14);
  assert.equal(result.isStale, true);
  assert.ok(result.warning!.includes("缺少 lastUpdated"));
});

// ── warnIfStale ────────────────────────────────────────────────────

test("warnIfStale: returns true when stale", () => {
  const result = checkStaleDataset("test", daysAgo(20), 14);
  assert.equal(warnIfStale(result), true);
});

test("warnIfStale: returns false when not stale", () => {
  const result = checkStaleDataset("test", daysAgo(1), 14);
  assert.equal(warnIfStale(result), false);
});
