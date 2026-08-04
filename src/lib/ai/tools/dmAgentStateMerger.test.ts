// src/lib/ai/tools/dmAgentStateMerger.test.ts
/**
 * DM Agent StateDelta Merger 测试
 *
 * 覆盖：
 * - 空工具追踪 → 默认空字段
 * - issue_quest 结果 → new_tasks 正确填充
 * - forge_weapon 成功 → currency_change + weapon_updates + consumed_items
 * - forge_weapon 失败 → 零 currency_change，无 awarded_items
 * - 写工具失败 → is_action_legal = false
 * - 只读工具失败 → 不影响 is_action_legal
 * - grant_item → awarded_items 正确
 * - consume_materials → consumed_items 正确
 * - resolve_combat_action → combat_updates + hp_delta
 * - 多工具结果 → 正确聚合
 * - 无 narrative override
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeToolResultsToDmFields,
  EMPTY_MERGED_FIELDS,
} from "./dmAgentStateMerger";
import type { DmToolCallTrace } from "./dmAgentTypes";

describe("StateMerger — Empty Input", () => {
  it("空工具追踪返回默认空字段", () => {
    const fields = mergeToolResultsToDmFields("test narrative", [], []);
    assert.strictEqual(fields.narrative, "test narrative");
    assert.strictEqual(fields.is_action_legal, true);
    assert.strictEqual(fields.sanity_damage, 0);
    assert.strictEqual(fields.is_death, false);
    assert.deepStrictEqual(fields.new_tasks, []);
    assert.deepStrictEqual(fields.consumed_items, []);
    assert.deepStrictEqual(fields.awarded_items, []);
    assert.strictEqual(fields.currency_change, 0);
  });

  it("EMPTY_MERGED_FIELDS 的 is_action_legal 默认为 true", () => {
    assert.strictEqual(EMPTY_MERGED_FIELDS.is_action_legal, true);
  });

  it("EMPTY_MERGED_FIELDS 的 currency_change 默认为 0", () => {
    assert.strictEqual(EMPTY_MERGED_FIELDS.currency_change, 0);
  });
});

describe("StateMerger — Quest Operations", () => {
  it("issue_quest 成功 → new_tasks 包含任务", () => {
    const traces: DmToolCallTrace[] = [
      { toolName: "issue_quest", ok: true, latencyMs: 10 },
    ];
    const toolData = [
      {
        toolName: "issue_quest",
        ok: true,
        data: {
          questId: "quest_test_1",
          title: "测试任务",
          description: "这是一个测试任务",
          source: "N-008",
          reward: "原石×3",
          nextHint: "去B1找老刘",
        },
      },
    ];

    const fields = mergeToolResultsToDmFields("任务已创建", traces, toolData);
    assert.strictEqual(fields.is_action_legal, true);
    assert.strictEqual(fields.new_tasks.length, 1);
    assert.strictEqual(fields.new_tasks[0].id, "quest_test_1");
    assert.strictEqual(fields.new_tasks[0].title, "测试任务");
  });

  it("update_quest_progress 成功 → task_updates 包含更新", () => {
    const traces: DmToolCallTrace[] = [
      { toolName: "update_quest_progress", ok: true, latencyMs: 5 },
    ];
    const toolData = [
      {
        toolName: "update_quest_progress",
        ok: true,
        data: { questId: "q1", newStatus: "completed", progressNote: "已完成" },
      },
    ];

    const fields = mergeToolResultsToDmFields("任务已更新", traces, toolData);
    assert.strictEqual(fields.task_updates.length, 1);
    assert.strictEqual(fields.task_updates[0].questId, "q1");
    assert.strictEqual(fields.task_updates[0].newStatus, "completed");
  });
});

describe("StateMerger — Forge Operations", () => {
  it("forge_weapon 成功 → currency_change 负值 + weapon_updates", () => {
    const traces: DmToolCallTrace[] = [
      { toolName: "forge_weapon", ok: true, latencyMs: 50 },
    ];
    const toolData = [
      {
        toolName: "forge_weapon",
        ok: true,
        data: {
          success: true,
          recipeName: "静音改装",
          weaponName: "静音匕首",
          materialsConsumed: ["sound_material"],
          originiumCost: 2,
        },
      },
    ];

    const fields = mergeToolResultsToDmFields("锻造成功", traces, toolData);
    assert.strictEqual(fields.currency_change, -2);
    assert.strictEqual(fields.weapon_updates.length, 1);
    assert.strictEqual(fields.weapon_updates[0].operation, "forge");
    assert.strictEqual(fields.weapon_updates[0].originiumCost, 2);
    assert.strictEqual(fields.consumed_items.length, 1);
    assert.strictEqual(fields.awarded_items.length, 1);
    assert.strictEqual(fields.awarded_items[0].id, "静音匕首");
  });

  it("forge_weapon 失败 → 零 currency_change，无 awarded_items", () => {
    const traces: DmToolCallTrace[] = [
      { toolName: "forge_weapon", ok: false, latencyMs: 20, error: "insufficient_materials" },
    ];
    const toolData = [
      { toolName: "forge_weapon", ok: false, data: null },
    ];

    const fields = mergeToolResultsToDmFields("锻造失败", traces, toolData);
    assert.strictEqual(fields.is_action_legal, false); // write tool failed
    assert.strictEqual(fields.currency_change, 0);
    assert.strictEqual(fields.awarded_items.length, 0);
    assert.strictEqual(fields.weapon_updates.length, 0);
  });
});

describe("StateMerger — Inventory Operations", () => {
  it("consume_materials → consumed_items 正确填充", () => {
    const traces: DmToolCallTrace[] = [
      { toolName: "consume_materials", ok: true, latencyMs: 5 },
    ];
    const toolData = [
      {
        toolName: "consume_materials",
        ok: true,
        data: { consumedItems: ["mat_1", "mat_2"] },
      },
    ];

    const fields = mergeToolResultsToDmFields("材料已消耗", traces, toolData);
    assert.strictEqual(fields.consumed_items.length, 2);
    assert.strictEqual(fields.consumed_items[0].id, "mat_1");
    assert.strictEqual(fields.consumed_items[1].id, "mat_2");
  });

  it("grant_item → awarded_items 正确填充", () => {
    const traces: DmToolCallTrace[] = [
      { toolName: "grant_item", ok: true, latencyMs: 3 },
    ];
    const toolData = [
      {
        toolName: "grant_item",
        ok: true,
        data: { itemId: "key_fragment", itemName: "钥匙碎片", source: "任务奖励" },
      },
    ];

    const fields = mergeToolResultsToDmFields("获得物品", traces, toolData);
    assert.strictEqual(fields.awarded_items.length, 1);
    assert.strictEqual(fields.awarded_items[0].id, "key_fragment");
  });
});

describe("StateMerger — Write Tool Failure → is_action_legal", () => {
  it("写工具失败 → is_action_legal = false", () => {
    const traces: DmToolCallTrace[] = [
      { toolName: "forge_weapon", ok: false, latencyMs: 10, error: "insufficient_currency" },
    ];
    const toolData = [{ toolName: "forge_weapon", ok: false, data: null }];

    const fields = mergeToolResultsToDmFields("锻造失败", traces, toolData);
    assert.strictEqual(fields.is_action_legal, false);
  });

  it("只读工具失败 → 不影响 is_action_legal", () => {
    const traces: DmToolCallTrace[] = [
      { toolName: "get_player_state", ok: false, latencyMs: 5, error: "timeout" },
    ];
    const toolData = [{ toolName: "get_player_state", ok: false, data: null }];

    const fields = mergeToolResultsToDmFields("状态查询失败", traces, toolData);
    assert.strictEqual(fields.is_action_legal, true); // readonly failure shouldn't block
  });
});

describe("StateMerger — Combat Operations", () => {
  it("resolve_combat_action → combat_updates + hp_delta", () => {
    const traces: DmToolCallTrace[] = [
      { toolName: "resolve_combat_action", ok: true, latencyMs: 15 },
    ];
    const toolData = [
      {
        toolName: "resolve_combat_action",
        ok: true,
        data: {
          actionType: "attack",
          outcome: "命中",
          damageDealt: 10,
          damageTaken: 3,
          effects: ["击退"],
        },
      },
    ];

    const fields = mergeToolResultsToDmFields("攻击命中", traces, toolData);
    assert.strictEqual(fields.combat_updates.length, 1);
    assert.strictEqual(fields.combat_updates[0].actionType, "attack");
    assert.strictEqual(fields.combat_updates[0].damageDealt, 10);
    assert.strictEqual(fields.combat_updates[0].damageTaken, 3);
    assert.strictEqual(fields.hp_delta, -3);
  });
});

describe("StateMerger — Narrative Preservation", () => {
  it("narrative 字段不被工具结果覆盖", () => {
    const narrative = "这是一段 DM 叙事文本，描述了锻造过程和结果";
    const traces: DmToolCallTrace[] = [
      { toolName: "forge_weapon", ok: true, latencyMs: 10 },
    ];
    const toolData = [
      { toolName: "forge_weapon", ok: true, data: { success: true, weaponName: "test" } },
    ];

    const fields = mergeToolResultsToDmFields(narrative, traces, toolData);
    assert.strictEqual(fields.narrative, narrative);
  });
});
