import test from "node:test";
import assert from "node:assert/strict";
import { buildTurnDeltaDigest } from "./buildTurnDeltaDigest";

test("buildTurnDeltaDigest: empty digest for no changes", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  });
  assert.strictEqual(result.hasChanges, false);
  assert.strictEqual(result.items.length, 0);
});

test("buildTurnDeltaDigest: aggregates sanity_damage as negative delta", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 3,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  });
  assert.ok(result.hasChanges);
  const sanity = result.items.find((i) => i.kind === "sanity") as any;
  assert.ok(sanity);
  assert.strictEqual(sanity.delta, -3);
});

test("buildTurnDeltaDigest: time consumption appears when consumes_time=true", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: true,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  });
  assert.ok(result.hasChanges);
  const time = result.items.find((i) => i.kind === "time") as any;
  assert.ok(time);
  assert.strictEqual(time.delta, -1);
});

test("buildTurnDeltaDigest: currency_change", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 50,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  });
  assert.ok(result.hasChanges);
  const currency = result.items.find((i) => i.kind === "currency") as any;
  assert.ok(currency);
  assert.strictEqual(currency.delta, 50);
});

test("buildTurnDeltaDigest: consumed items as string array", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: ["破旧的绷带"],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  });
  assert.ok(result.hasChanges);
  const consumed = result.items.find((i) => i.kind === "consumed") as any;
  assert.ok(consumed);
  assert.strictEqual(consumed.label, "破旧的绷带");
});

test("buildTurnDeltaDigest: awarded items from object entries", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [{ id: "old_key", name: "生锈的钥匙" }],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  });
  assert.ok(result.hasChanges);
  const acquire = result.items.find((i) => i.kind === "acquired") as any;
  assert.ok(acquire);
  assert.strictEqual(acquire.label, "生锈的钥匙");
});

test("buildTurnDeltaDigest: award items with id fallback", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [{ id: "item_without_name" }],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  });
  const acquire = result.items.find((i) => i.kind === "acquired") as any;
  assert.ok(acquire);
  assert.strictEqual(acquire.label, "item_without_name");
});

test("buildTurnDeltaDigest: warehouse items", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [{ id: "w_item", name: "档案柜里的记录" }],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  });
  const wh = result.items.find((i) => i.kind === "warehouse_acquired") as any;
  assert.ok(wh);
  assert.strictEqual(wh.label, "档案柜里的记录");
});

test("buildTurnDeltaDigest: codex updates", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [{ id: "N-008", name: "电工老刘" }],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  });
  assert.ok(result.hasChanges);
  const codex = result.items.find((i) => i.kind === "codex") as any;
  assert.ok(codex);
  assert.strictEqual(codex.label, "电工老刘");
});

test("buildTurnDeltaDigest: task with title", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [{ title: "调查黑暗中的声响" }],
    task_updates: [],
    foreshadow_ops: [],
  });
  const task = result.items.find((i) => i.kind === "new") as any;
  assert.ok(task);
  assert.strictEqual(task.label, "调查黑暗中的声响");
});

test("buildTurnDeltaDigest: completed task update", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [{ id: "t1", title: "找到出口", status: "completed" }],
    foreshadow_ops: [],
  });
  const status = result.items.find((i) => i.kind === "status") as any;
  assert.ok(status);
  assert.match(status.label, /完成/);
});

test("buildTurnDeltaDigest: foreshadow payoff op", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [{ op: "payoff", text: "前台的钟停了", source: "dm" }],
  });
  assert.ok(result.hasChanges);
  const payoff = result.items.find((i) => i.kind === "foreshadow_payoff") as any;
  assert.ok(payoff);
  assert.strictEqual(payoff.seedText, "前台的钟停了");
});

test("buildTurnDeltaDigest: non-payoff foreshadow ops are ignored", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [{ op: "plant", text: "墙上的影子", importance: 2 }],
  });
  assert.strictEqual(result.hasChanges, false);
});

test("buildTurnDeltaDigest: caps per-dimension at maxPerDim", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `item_${i}`, name: `道具${i}` }));
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: items,
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  }, 2);
  const acquired = result.items.filter((i) => i.kind === "acquired");
  assert.strictEqual(acquired.length, 2);
});

test("buildTurnDeltaDigest: all zeros and empty arrays has no changes", () => {
  const result = buildTurnDeltaDigest({
    sanity_damage: 0,
    consumes_time: false,
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    foreshadow_ops: [],
  });
  assert.strictEqual(result.hasChanges, false);
  assert.strictEqual(result.items.length, 0);
});
