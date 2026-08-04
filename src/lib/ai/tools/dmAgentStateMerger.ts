// src/lib/ai/tools/dmAgentStateMerger.ts
/**
 * DM Agent StateDelta → DM JSON Merger
 * 
 * 将 DM Agent 工具执行结果映射为标准 DM JSON 字段，
 * 使其能被 normalizePlayerDmJson / resolveDmTurn / commitTurn 正确消费。
 * 
 * 核心原则：
 * - 工具结果是"候选变更"，不是"最终状态"
 * - 所有变更必须经过 normalize → guards → validator → resolve → commit
 * - 模型输出的 narrative 只是呈现，结构化字段才是权威
 */

import type { DmToolCallTrace } from "./dmAgentTypes";

// ============================================================
// Merger Types
// ============================================================

/** 标准 DM JSON 可合并字段 */
export interface MergedDmFields {
  is_action_legal: boolean;
  sanity_damage: number;
  narrative: string;
  is_death: boolean;
  consumes_time: boolean;
  options: string[];
  // 标准 StateDelta 字段
  currency_change: number;
  consumed_items: Array<{ id: string; name?: string }>;
  awarded_items: Array<{ id: string; name?: string; source?: string }>;
  awarded_warehouse_items: Array<{ id: string; name?: string }>;
  new_tasks: Array<{
    id: string;
    title: string;
    description: string;
    source?: string;
    reward?: string;
    nextHint?: string;
  }>;
  task_updates: Array<{
    questId: string;
    newStatus: string;
    progressNote?: string;
  }>;
  weapon_updates: Array<{
    operation: string;
    recipeName?: string;
    weaponName?: string;
    materialsConsumed?: string[];
    originiumCost?: number;
  }>;
  combat_updates: Array<{
    actionType: string;
    outcome: string;
    damageDealt?: number;
    damageTaken?: number;
    effects?: string[];
  }>;
  player_location?: string;
  npc_location_updates?: Array<{
    npcId: string;
    location: string;
    reason?: string;
  }>;
  hp_delta?: number;
}

/** 合并的默认值 */
export const EMPTY_MERGED_FIELDS: MergedDmFields = {
  is_action_legal: true,
  sanity_damage: 0,
  narrative: "",
  is_death: false,
  consumes_time: true,
  options: [],
  currency_change: 0,
  consumed_items: [],
  awarded_items: [],
  awarded_warehouse_items: [],
  new_tasks: [],
  task_updates: [],
  weapon_updates: [],
  combat_updates: [],
};

// ============================================================
// Tool Result → Merged Fields
// ============================================================

/** 单个工具结果的领域数据 */
interface ToolResultData {
  toolName: string;
  ok: boolean;
  data: unknown;
}

/**
 * 将工具追踪记录转换为可合并的 DM JSON 字段
 * 
 * 只处理成功 (ok: true) 的工具调用结果。
 * 每个工具的类型安全映射，避免属性误读。
 */
export function mergeToolResultsToDmFields(
  narrative: string,
  traces: DmToolCallTrace[],
  toolResultData: ToolResultData[]
): MergedDmFields {
  // Deep-clone arrays to avoid mutating EMPTY_MERGED_FIELDS shared references
  const fields: MergedDmFields = {
    ...EMPTY_MERGED_FIELDS,
    narrative,
    options: [...EMPTY_MERGED_FIELDS.options],
    consumed_items: [...EMPTY_MERGED_FIELDS.consumed_items],
    awarded_items: [...EMPTY_MERGED_FIELDS.awarded_items],
    awarded_warehouse_items: [...EMPTY_MERGED_FIELDS.awarded_warehouse_items],
    new_tasks: [...EMPTY_MERGED_FIELDS.new_tasks],
    task_updates: [...EMPTY_MERGED_FIELDS.task_updates],
    weapon_updates: [...EMPTY_MERGED_FIELDS.weapon_updates],
    combat_updates: [...EMPTY_MERGED_FIELDS.combat_updates],
  };

  // 如果有工具执行失败，is_action_legal 应为 false（除非是只读工具失败）
  const writeTraceFailures = traces.filter(
    (t) => !t.ok && !isReadonlyTool(t.toolName)
  );
  if (writeTraceFailures.length > 0) {
    fields.is_action_legal = false;
  }

  // 从工具结果提取结构化变更
  for (const result of toolResultData) {
    if (!result.ok) continue;

    switch (result.toolName) {
      case "issue_quest": {
        const d = result.data as IssueQuestResultData | undefined;
        if (d?.questId) {
          fields.new_tasks.push({
            id: d.questId,
            title: d.title ?? "新任务",
            description: d.description ?? "",
            source: d.source,
            reward: d.reward,
            nextHint: d.nextHint,
          });
        }
        break;
      }
      case "update_quest_progress": {
        const d = result.data as UpdateQuestResultData | undefined;
        if (d?.questId) {
          fields.task_updates.push({
            questId: d.questId,
            newStatus: d.newStatus ?? "active",
            progressNote: d.progressNote,
          });
        }
        break;
      }
      case "forge_weapon": {
        const d = result.data as ForgeResultData | undefined;
        if (d?.success) {
          fields.currency_change -= (d.originiumCost ?? 0);
          fields.weapon_updates.push({
            operation: "forge",
            recipeName: d.recipeName,
            weaponName: d.weaponName,
            materialsConsumed: d.materialsConsumed,
            originiumCost: d.originiumCost,
          });
          if (d.materialsConsumed) {
            fields.consumed_items.push(
              ...d.materialsConsumed.map((tag) => ({ id: tag, name: tag }))
            );
          }
          if (d.weaponName) {
            fields.awarded_items.push({
              id: d.weaponName,
              name: d.weaponName,
              source: "锻造产出",
            });
          }
        }
        break;
      }
      case "consume_materials": {
        const d = result.data as ConsumeResultData | undefined;
        if (d?.consumedItems) {
          fields.consumed_items.push(
            ...d.consumedItems.map((id) => ({ id, name: id }))
          );
        }
        break;
      }
      case "grant_item": {
        const d = result.data as GrantItemResultData | undefined;
        if (d?.itemId) {
          fields.awarded_items.push({
            id: d.itemId,
            name: d.itemName ?? d.itemId,
            source: d.source,
          });
        }
        break;
      }
      case "start_combat": {
        const d = result.data as StartCombatResultData | undefined;
        if (d?.combatId) {
          // 战斗开始不直接改 DM JSON，由 combat state 管理
          fields.consumes_time = true;
        }
        break;
      }
      case "resolve_combat_action": {
        const d = result.data as CombatActionResultData | undefined;
        if (d?.actionType) {
          const damageDealt = d.damageDealt ?? 0;
          const damageTaken = d.damageTaken ?? 0;
          if (damageTaken > 0) {
            fields.hp_delta = -(damageTaken);
          }
          fields.combat_updates.push({
            actionType: d.actionType,
            outcome: d.outcome ?? "unknown",
            damageDealt,
            damageTaken,
            effects: d.effects,
          });
        }
        break;
      }
      case "apply_world_event": {
        const d = result.data as WorldEventResultData | undefined;
        if (d?.applied && d.eventType === "npc_move") {
          const ed = d.eventData as { npc_id?: string; target_location?: string } | undefined;
          if (ed?.npc_id && ed?.target_location) {
            fields.npc_location_updates = fields.npc_location_updates ?? [];
            fields.npc_location_updates.push({
              npcId: ed.npc_id,
              location: ed.target_location,
              reason: d.description,
            });
          }
        }
        break;
      }
    }
  }

  return fields;
}

// ============================================================
// Type Helpers for Tool Result Data
// ============================================================

interface IssueQuestResultData {
  questId: string;
  title?: string;
  description?: string;
  source?: string;
  reward?: string;
  nextHint?: string;
}

interface UpdateQuestResultData {
  questId: string;
  newStatus?: string;
  progressNote?: string;
}

interface ForgeResultData {
  success: boolean;
  recipeName?: string;
  weaponName?: string;
  materialsConsumed?: string[];
  originiumCost?: number;
}

interface ConsumeResultData {
  consumedItems?: string[];
}

interface GrantItemResultData {
  itemId?: string;
  itemName?: string;
  source?: string;
}

interface StartCombatResultData {
  combatId?: string;
}

interface CombatActionResultData {
  actionType?: string;
  outcome?: string;
  damageDealt?: number;
  damageTaken?: number;
  effects?: string[];
}

interface WorldEventResultData {
  applied?: boolean;
  eventType?: string;
  description?: string;
  eventData?: Record<string, unknown>;
}

// ============================================================
// Helpers
// ============================================================

/** 只读工具名称集合 */
const READONLY_TOOLS = new Set([
  "get_player_state",
  "get_inventory",
  "get_active_quests",
  "get_world_context",
  "get_combat_state",
  "inspect_forge_options",
]);

function isReadonlyTool(toolName: string): boolean {
  return READONLY_TOOLS.has(toolName);
}

