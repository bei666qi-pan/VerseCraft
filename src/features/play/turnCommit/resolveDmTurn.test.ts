import test from "node:test";
import assert from "node:assert/strict";
import { resolveTurnConsistency } from "@/features/play/turnCommit/resolveDmTurn";

/**
 * ## 阶段1-4 验收清单（人工）
 * - 正常决策回合主笔给出选项：应出现可点击选项。
 * - 决策回合主笔漏给选项：应自动补齐（或允许手动“让主笔重新整理选项”补齐）。
 * - 自动补齐失败：仍能手动刷新，或切到手动输入继续推进（不死锁）。
 * - narrative_only / system_transition：不强行补选项；应有继续推进能力（或明确说明本回合无选项）。
 * - 脏输出/重复 JSON：正文尽量保住，不出现明显“正文回退”。
 * - 真正彻底坏掉：才显示“格式异常”提示。
 */

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
  assert.deepEqual(out.clue_updates, []);
  assert.deepEqual(out.task_changes.new_tasks, []);
  assert.deepEqual(out.task_changes.task_updates, []);
  assert.deepEqual(out.relation_changes.relationship_updates, []);
  assert.deepEqual(out.loot_changes.awarded_items, []);
  assert.deepEqual(out.clue_changes.clue_updates, []);
  assert.deepEqual(out.world_state_changes.npc_location_updates, []);
  assert.equal(out.conflict_outcome, null);
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

test("resolveTurnConsistency: new_tasks should only auto-open for accepted formal tasks", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "新的委托被提起。",
    is_death: false,
    consumes_time: true,
    options: [],
    new_tasks: [
      // 仅“正式任务 + 已接下（active）”才触发自动打开与高亮
      { id: "floor_1f_probe", title: "一楼试探性探索", status: "active", taskNarrativeLayer: "formal_task" },
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

test("resolveTurnConsistency: clue_updates normalizes to ClueEntry[]", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "你在告示边角看到一行铅笔字。",
    is_death: false,
    consumes_time: true,
    options: [],
    clue_updates: [{ title: "告示旁字迹", detail: "写着别在子时按电梯", kind: "trace" }],
  } as any);
  assert.equal(Array.isArray(out.clue_updates), true);
  assert.equal(out.clue_updates.length, 1);
  assert.equal(out.clue_updates[0]?.title, "告示旁字迹");
  assert.equal(out.clue_updates[0]?.kind, "trace");
  assert.equal(out.clue_changes.clue_updates.length, 1);
});

test("resolveTurnConsistency: conflict_outcome derives from combat_summary", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "你在门厅逼退了对方。",
    is_death: false,
    consumes_time: true,
    options: [],
    combat_summary: {
      outcome: "edge",
      layer: "narrow_pushback",
      text: "你抢到半步位置，把他逼离门缝。",
      cost: "moderate",
      npcIds: ["N-010"],
    },
  } as any);
  assert.equal(out.conflict_outcome?.outcomeTier, "edge");
  assert.equal(out.conflict_outcome?.resultLayer, "narrow_pushback");
  assert.equal(out.conflict_outcome?.likelyCost, "moderate");
  assert.deepEqual(out.conflict_outcome?.linkedNpcIds, ["N-010"]);
});

test("resolveTurnConsistency: time_cost normalizes to known kind", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "你试探着问了一句。",
    is_death: false,
    consumes_time: true,
    time_cost: "light",
    options: [],
  } as any);
  assert.equal(out.time_cost, "light");
});

test("resolveTurnConsistency: invalid time_cost omitted", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "x",
    is_death: false,
    consumes_time: true,
    time_cost: "nope",
    options: [],
  } as any);
  assert.equal(out.time_cost, undefined);
});

test("resolveTurnConsistency: legacy/default decision turn with missing options should keep decision_required true and wait regen", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "测试",
    is_death: false,
    consumes_time: true,
    // legacy protocol: no turn_mode, no decision_options, options empty
    options: [],
  } as any);
  assert.equal(out.turn_mode, "decision_required");
  assert.equal(out.decision_required, true);
  assert.deepEqual(out.decision_options, []);
  assert.equal(out.ui_hints?.consistency_flags?.includes("invalid_decision_options_waiting_regen") ?? false, true);
});

test("resolveTurnConsistency: explicit narrative_only should disable decision_required", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "只是叙事推进。",
    is_death: false,
    consumes_time: true,
    turn_mode: "narrative_only",
    options: [],
  } as any);
  assert.equal(out.turn_mode, "narrative_only");
  assert.equal(out.decision_required, false);
  assert.deepEqual(out.decision_options, []);
});

test("resolveTurnConsistency: explicit system_transition should disable decision_required and options", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "系统切换。",
    is_death: false,
    consumes_time: true,
    turn_mode: "system_transition",
    options: ["不该出现的 legacy 选项"],
  } as any);
  assert.equal(out.turn_mode, "system_transition");
  assert.equal(out.decision_required, false);
  assert.deepEqual(out.decision_options, []);
  assert.deepEqual(out.options, []);
});

test("resolveTurnConsistency: explicit decision_required with invalid payload should downgrade to narrative_only and flag", () => {
  const out = resolveTurnConsistency({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "模型说这是决策回合，但没给出有效选项。",
    is_death: false,
    consumes_time: true,
    turn_mode: "decision_required",
    decision_options: ["只有一条"], // invalid (<2)
    options: [],
  } as any);
  assert.equal(out.turn_mode, "narrative_only");
  assert.equal(out.decision_required, false);
  assert.equal(out.ui_hints?.consistency_flags?.includes("invalid_decision_options_downgraded") ?? false, true);
  assert.equal(out.ui_hints?.consistency_flags?.includes("invalid_decision_required_payload") ?? false, true);
});

