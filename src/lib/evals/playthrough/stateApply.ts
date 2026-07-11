/**
 * 从 DM JSON 应用状态变化 —— 纯函数，无副作用。
 *
 * 提取为独立模块以避免 orchestrator ↔ sutAdapter 循环引用。
 * 两处调用：
 *   1. orchestrator.ts — 编排器主循环第④步
 *   2. sutAdapter.ts — MockSutAdapter 内部状态同步
 */
import type { GameStateSnapshot } from "./types";

export function applyDmJsonToState(
  state: GameStateSnapshot,
  dmJson: Record<string, unknown>,
  _narrative: string
): GameStateSnapshot {
  const delta: Partial<GameStateSnapshot> = {};

  // turnCount + 1
  delta.turnCount = state.turnCount + 1;

  // HP（直接覆盖——战斗/治疗事件用）
  if (typeof dmJson["hp"] === "number") {
    delta.hp = Math.max(0, Math.min(state.maxHp, dmJson["hp"] as number));
  }

  // sanity_damage
  if (typeof dmJson["sanity_damage"] === "number") {
    delta.sanity = Math.max(0, state.sanity - (dmJson["sanity_damage"] as number));
  }

  // player_location
  if (typeof dmJson["player_location"] === "string") {
    delta.playerLocation = dmJson["player_location"] as string;
  }

  // is_death
  if (dmJson["is_death"] === true) {
    delta.isDeath = true;
  }

  // reached_ending
  if (dmJson["reached_ending"] === true || dmJson["is_ending"] === true) {
    delta.reachedEnding = true;
  }

  // profession
  if (typeof dmJson["profession"] === "string") {
    delta.profession = dmJson["profession"] as string;
  }

  // equippedWeapon
  if (typeof dmJson["equippedWeapon"] === "string") {
    delta.equippedWeapon = dmJson["equippedWeapon"] as string;
  }

  // currency_change
  if (dmJson["currency_change"] && typeof dmJson["currency_change"] === "object") {
    const cc = dmJson["currency_change"] as Record<string, number>;
    if (typeof cc["originium"] === "number") {
      delta.originium = Math.max(0, state.originium + cc["originium"]);
    }
    if (typeof cc["sanity"] === "number") {
      delta.sanity = Math.max(0, (delta.sanity ?? state.sanity) + cc["sanity"]);
    }
  }

  // consumed_items
  if (Array.isArray(dmJson["consumed_items"])) {
    delta.inventoryItemCount = Math.max(0, state.inventoryItemCount - dmJson["consumed_items"].length);
  }

  // awarded_items
  if (Array.isArray(dmJson["awarded_items"])) {
    delta.inventoryItemCount = state.inventoryItemCount + dmJson["awarded_items"].length;
  }

  // codex_updates
  if (Array.isArray(dmJson["codex_updates"])) {
    const newIds: string[] = [];
    for (const u of dmJson["codex_updates"] as Array<Record<string, unknown>>) {
      if (typeof u["entry_id"] === "string") newIds.push(u["entry_id"] as string);
    }
    delta.codexNpcIds = [...state.codexNpcIds, ...newIds];
  }

  // new_tasks（新增任务 → activeTaskIds）
  if (Array.isArray(dmJson["new_tasks"])) {
    const newTaskIds: string[] = [];
    for (const t of dmJson["new_tasks"] as Array<Record<string, unknown>>) {
      if (typeof t["task_id"] === "string") newTaskIds.push(t["task_id"] as string);
    }
    delta.activeTaskIds = [...state.activeTaskIds, ...newTaskIds];
  }

  // task_updates（completed 推进）
  if (Array.isArray(dmJson["task_updates"])) {
    const newlyCompleted: string[] = [];
    for (const u of dmJson["task_updates"] as Array<Record<string, unknown>>) {
      if (u["status"] === "completed" && typeof u["task_id"] === "string") {
        newlyCompleted.push(u["task_id"] as string);
      }
    }
    delta.completedTaskIds = [...state.completedTaskIds, ...newlyCompleted];
  }

  // aliveNpcIds
  if (Array.isArray(dmJson["aliveNpcIds"])) {
    const newNpcs: string[] = [];
    for (const npc of dmJson["aliveNpcIds"] as string[]) {
      if (!state.aliveNpcIds.includes(npc) && !state.deadNpcIds.includes(npc)) {
        newNpcs.push(npc);
      }
    }
    delta.aliveNpcIds = [...state.aliveNpcIds, ...newNpcs];
  }

  // weapon_updates
  if (dmJson["weapon_updates"] && typeof dmJson["weapon_updates"] === "object") {
    const wu = dmJson["weapon_updates"] as Record<string, unknown>;
    if (typeof wu["stability"] === "number") {
      delta.weaponStability = Math.max(0, Math.min(100, wu["stability"] as number));
    }
    if (typeof wu["contamination"] === "number") {
      delta.weaponContamination = Math.max(0, Math.min(100, wu["contamination"] as number));
    }
  }

  // unlockedFlags（少数场景可以用）
  if (Array.isArray(dmJson["unlocked_flags"])) {
    const newFlags: string[] = [];
    for (const f of dmJson["unlocked_flags"] as string[]) {
      if (!state.unlockedFlags.includes(f)) newFlags.push(f);
    }
    delta.unlockedFlags = [...state.unlockedFlags, ...newFlags];
  }

  return {
    ...state,
    ...delta,
    inventoryItemIds: state.inventoryItemIds,
  };
}
