import test from "node:test";
import assert from "node:assert/strict";
import { resolveTurnConsistency } from "@/features/play/turnCommit/resolveDmTurn";

test("resolveTurnConsistency: arrays default to empty and options stays array", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "测试",
    is_death: false,
    consumes_time: true,
    options: null,
  } as any);
  assert.deepEqual(out.options, []);
  assert.deepEqual(out.awarded_items, []);
  assert.deepEqual(out.awarded_warehouse_items, []);
  assert.deepEqual(out.new_tasks, []);
  assert.deepEqual(out.task_updates, []);
});

test("resolveTurnConsistency: acquire semantics without awards should be downgraded and flagged", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "你在暗格中获得了旧钥匙。",
    is_death: false,
    consumes_time: true,
    options: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    security_meta: {},
  });
  assert.equal(out.narrative.includes("获得了"), false);
  assert.equal(out.ui_hints?.consistency_flags?.includes("acquire_without_awards_downgraded") ?? false, true);
  assert.equal(out.security_meta?.consistency_warning, "acquire_without_awards_downgraded");
});

test("resolveTurnConsistency: awards without explicit acquire text should only record flag", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "你把东西收进背包，继续前行。",
    is_death: false,
    consumes_time: true,
    options: [],
    awarded_items: ["I-C12"],
    awarded_warehouse_items: [],
  });
  assert.equal(out.ui_hints?.consistency_flags?.includes("awards_without_explicit_acquire_text") ?? false, true);
});

test("resolveTurnConsistency: new_tasks should generate ui_hints auto_open_panel + highlight ids", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "新的委托被提起。",
    is_death: false,
    consumes_time: true,
    options: [],
    new_tasks: [
      { id: "floor_1f_probe", title: "一楼试探性探索" },
    ],
  } as any);
  assert.equal(out.ui_hints?.auto_open_panel, "task");
  assert.deepEqual(out.ui_hints?.highlight_task_ids, ["floor_1f_probe"]);
  assert.equal(Array.isArray(out.new_tasks) && out.new_tasks.length === 1, true);
});

test("resolveTurnConsistency: completed/failed task_updates may produce toast_hint", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "你回头看了一眼。",
    is_death: false,
    consumes_time: true,
    options: [],
    task_updates: [{ id: "t1", status: "completed" }],
  } as any);
  assert.equal(typeof out.ui_hints?.toast_hint === "string", true);
  assert.equal((out.ui_hints?.toast_hint ?? "").length > 0, true);
});

