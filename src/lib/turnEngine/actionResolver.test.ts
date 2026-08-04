import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveActionsFromNarrative,
  getBackfillTelemetrySummary,
} from "@/lib/turnEngine/actionResolver";

// ── Pickup backfill ──

test("resolveActionsFromNarrative detects 捡起 and backfills item", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你蹲下身，捡起了黄铜钥匙。",
  });
  assert.equal(result.didBackfill, true);
  assert.ok(result.awardedItems);
  assert.equal(result.awardedItems!.length, 1);
  assert.equal(result.awardedItems![0].name, "黄铜钥匙");
  assert.equal(result.telemetry.pickupAttempts, 1);
});

test("resolveActionsFromNarrative detects 拾起", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你拾起了地上的旧照片。",
  });
  assert.equal(result.didBackfill, true);
  assert.ok(result.awardedItems);
  assert.ok(result.awardedItems![0].name.includes("旧照片"), `got: ${result.awardedItems![0].name}`);
});

test("resolveActionsFromNarrative detects 发现 with 一张", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你发现了一张泛黄的字条。",
  });
  assert.equal(result.didBackfill, true);
  assert.ok(result.awardedItems);
  assert.equal(result.awardedItems![0].name, "泛黄的字条");
});

test("resolveActionsFromNarrative detects 获得 with 一个", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你获得了一个锈迹斑斑的铁盒。",
  });
  assert.equal(result.didBackfill, true);
  assert.ok(result.awardedItems);
  assert.equal(result.awardedItems![0].name, "锈迹斑斑的铁盒");
});

test("resolveActionsFromNarrative skips pickup when existingAwardedItems non-empty", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你捡起了黄铜钥匙。",
    existingAwardedItems: [{ id: "existing", name: "old_item" }],
  });
  assert.equal(result.didBackfill, false);
  assert.equal(result.awardedItems, undefined);
  assert.equal(result.telemetry.pickupAttempts, 0);
});

// ── Consume backfill ──

test("resolveActionsFromNarrative detects 用掉 and backfills consumed item", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你用掉了最后一卷绷带，伤口勉强止住了血。",
  });
  assert.equal(result.didBackfill, true);
  assert.ok(result.consumedItems);
  assert.ok(result.consumedItems![0].name.includes("绷带"), `got: ${result.consumedItems![0].name}`);
  assert.equal(result.telemetry.consumeAttempts, 1);
});

test("resolveActionsFromNarrative detects 消耗", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你消耗了一瓶镇定剂，手指不再颤抖。",
  });
  assert.equal(result.didBackfill, true);
  assert.ok(result.consumedItems);
  assert.ok(result.consumedItems![0].name.includes("镇定剂"), `got: ${result.consumedItems![0].name}`);
});

test("resolveActionsFromNarrative detects 吞下", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你吞下了止痛药，头痛缓解了一些。",
  });
  assert.equal(result.didBackfill, true);
  assert.ok(result.consumedItems);
  assert.ok(result.consumedItems![0].name.includes("止痛药"), `got: ${result.consumedItems![0].name}`);
});

test("resolveActionsFromNarrative skips consume when existingConsumedItems non-empty", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你用掉了绷带。",
    existingConsumedItems: [{ id: "existing", name: "used" }],
  });
  assert.equal(result.didBackfill, false);
  assert.equal(result.consumedItems, undefined);
});

// ── Currency / originium backfill ──

test("resolveActionsFromNarrative detects originium usage from 捏碎", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你咬牙捏碎了一块原石，暖流涌入体内。",
  });
  assert.equal(result.didBackfill, true);
  assert.equal(result.originiumDelta, -1);
  assert.equal(result.telemetry.currencyAttempts, 1);
});

test("resolveActionsFromNarrative detects 使用原石", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你使用了一颗原石来恢复理智。",
  });
  assert.equal(result.didBackfill, true);
  assert.equal(result.originiumDelta, -1);
});

test("resolveActionsFromNarrative skips currency when existingOriginiumChange provided", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你捏碎了一块原石。",
    existingOriginiumChange: -1,
  });
  assert.equal(result.didBackfill, false);
  assert.equal(result.originiumDelta, undefined);
});

// ── Task backfill ──

test("resolveActionsFromNarrative detects task completion from 终于完成了", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你终于完成了对走廊的彻底搜查，所有线索都指向了那个房间。",
  });
  assert.equal(result.didBackfill, true);
  assert.ok(result.taskUpdates);
  assert.equal(result.taskUpdates![0].taskHint, "narrative_implied_completion");
  assert.equal(result.telemetry.taskCompleteAttempts, 1);
});

test("resolveActionsFromNarrative detects task from 任务完成", () => {
  const result = resolveActionsFromNarrative({
    narrative: "调查任务完成了，你获得了新的线索。",
  });
  assert.equal(result.didBackfill, true);
  assert.ok(result.taskUpdates);
});

test("resolveActionsFromNarrative skips task when hasTaskUpdates is true", () => {
  const result = resolveActionsFromNarrative({
    narrative: "任务完成了。",
    hasTaskUpdates: true,
  });
  assert.equal(result.didBackfill, false);
  assert.equal(result.taskUpdates, undefined);
});

// ── Combined / multi-action ──

test("resolveActionsFromNarrative detects both pickup and consume in same narrative", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你捡起了生锈的钥匙，然后吞下了一颗止痛药。",
  });
  assert.equal(result.didBackfill, true);
  assert.ok(result.awardedItems);
  assert.ok(result.consumedItems);
  assert.equal(result.awardedItems![0].name, "生锈的钥匙");
  assert.ok(result.consumedItems![0].name.includes("止痛药"), `got: ${result.consumedItems![0].name}`);
});

// ── No false positives ──

test("resolveActionsFromNarrative does NOT backfill on plain narrative", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你环顾四周，走廊空无一人，只有风吹过窗帘的声音。",
  });
  assert.equal(result.didBackfill, false);
  assert.equal(result.awardedItems, undefined);
  assert.equal(result.consumedItems, undefined);
  assert.equal(result.originiumDelta, undefined);
});

test("resolveActionsFromNarrative does NOT misparse 发现 with truly abstract context", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你发现自己的心跳在加速，不安的感觉越来越强烈。",
  });
  // Pure emotional/internal discoveries should not trigger pickup
  // (Note: 发现 without quantifier can produce false positives for concrete nouns)
  assert.equal(result.didBackfill, false);
  assert.equal(result.awardedItems, undefined);
});

test("resolveActionsFromNarrative does NOT backfill non-items", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你发现了一个威胁——墙上的裂缝正在扩大。",
  });
  // "威胁" is on the non-item list
  assert.equal(result.awardedItems, undefined);
});

// ── getBackfillTelemetrySummary ──

test("getBackfillTelemetrySummary produces correct shape with backfill", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你捡起了钥匙，用掉了绷带。",
  });
  const summary = getBackfillTelemetrySummary(result);
  assert.equal(summary.backfill_did_run, 1);
  assert.equal(summary.backfill_pickup, 1);
  assert.equal(summary.backfill_consume, 1);
});

test("getBackfillTelemetrySummary produces correct shape without backfill", () => {
  const result = resolveActionsFromNarrative({
    narrative: "你继续前进。",
  });
  const summary = getBackfillTelemetrySummary(result);
  assert.equal(summary.backfill_did_run, 0);
  assert.equal(summary.backfill_pickup, 0);
  assert.equal(summary.backfill_consume, 0);
  assert.equal(summary.backfill_task, 0);
  assert.equal(summary.backfill_currency, 0);
});

// ── Regression: existing behavior preserved ──

test("resolveActionsFromNarrative returns telemetry object with all counters", () => {
  const result = resolveActionsFromNarrative({ narrative: "test" });
  assert.ok("pickupAttempts" in result.telemetry);
  assert.ok("consumeAttempts" in result.telemetry);
  assert.ok("taskCompleteAttempts" in result.telemetry);
  assert.ok("currencyAttempts" in result.telemetry);
});

test("resolveActionsFromNarrative didBackfill defaults to false", () => {
  const result = resolveActionsFromNarrative({ narrative: "no actions here" });
  assert.equal(result.didBackfill, false);
});
