/**
 * 从 DM JSON 应用状态变化 —— 纯函数，无副作用。
 *
 * 提取为独立模块以避免 orchestrator ↔ sutAdapter 循环引用。
 * 两处调用：
 *   1. orchestrator.ts — 编排器主循环第④步
 *   2. sutAdapter.ts — MockSutAdapter 内部状态同步
 */
import type { GameStateSnapshot } from "./types";

export function floorFromLocation(location: string, fallback = "3F"): string {
  const value = String(location ?? "").trim();
  if (/^B2(?:_|$)|地下二层|负二层/i.test(value)) return "B2";
  if (/^B1(?:_|$)|地下一层|负一层/i.test(value)) return "B1";
  const canonical = value.match(/^(\d+)F(?:_|$)/i);
  if (canonical) return `${canonical[1]}F`;
  const chinese = value.match(/([一二三四五六七八九十]+)楼/);
  const map: Record<string, string> = { 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9", 十: "10" };
  if (chinese?.[1] && map[chinese[1]]) return `${map[chinese[1]]}F`;
  return fallback;
}

export function applyDmJsonToState(
  state: GameStateSnapshot,
  dmJson: Record<string, unknown>,
  _narrative: string
): GameStateSnapshot {
  void _narrative;
  const delta: Partial<GameStateSnapshot> = {};

  // turnCount + 1
  delta.turnCount = state.turnCount + 1;

  // HP（直接覆盖——战斗/治疗事件用）
  if (typeof dmJson["hp"] === "number") {
    delta.hp = Math.max(0, Math.min(state.maxHp, dmJson["hp"] as number));
  }

  // sanity_damage
  if (typeof dmJson["sanity_damage"] === "number" && Number.isFinite(dmJson["sanity_damage"])) {
    delta.sanity = Math.max(0, state.sanity - (dmJson["sanity_damage"] as number));
  }

  // player_location
  if (typeof dmJson["player_location"] === "string") {
    delta.playerLocation = dmJson["player_location"] as string;
    delta.currentFloor = floorFromLocation(dmJson["player_location"] as string, state.currentFloor);
  }

  // is_death
  if (dmJson["is_death"] === true) {
    delta.isDeath = true;
  }

  // reached_ending
  if (dmJson["reached_ending"] === true || dmJson["is_ending"] === true || (dmJson["ending_finale"] && typeof dmJson["ending_finale"] === "object")) {
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

  // currency_change: the current wire contract is a numeric originium delta;
  // retain the legacy object form so older traces remain replayable.
  if (typeof dmJson["currency_change"] === "number" && Number.isFinite(dmJson["currency_change"])) {
    delta.originium = Math.max(0, state.originium + dmJson["currency_change"]);
  } else if (dmJson["currency_change"] && typeof dmJson["currency_change"] === "object") {
    const cc = dmJson["currency_change"] as Record<string, number>;
    if (typeof cc["originium"] === "number") {
      delta.originium = Math.max(0, state.originium + cc["originium"]);
    }
    if (typeof cc["sanity"] === "number") {
      delta.sanity = Math.max(0, (delta.sanity ?? state.sanity) + cc["sanity"]);
    }
  }

  // consumed_items
  const consumedIds = Array.isArray(dmJson["consumed_items"])
    ? dmJson["consumed_items"].filter((x): x is string => typeof x === "string")
    : [];
  const awardedIds = Array.isArray(dmJson["awarded_items"])
    ? dmJson["awarded_items"].flatMap((raw): string[] => {
        if (typeof raw === "string") return raw ? [raw] : [];
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
        const id = (raw as Record<string, unknown>).id;
        return typeof id === "string" && id ? [id] : [];
      })
    : [];
  const consumedCount = consumedIds.length;
  const awardedCount = awardedIds.length;
  if (consumedCount > 0 || awardedCount > 0) {
    const consumed = new Set(consumedIds);
    const nextInventoryIds = state.inventoryItemIds.filter((id) => !consumed.has(id));
    for (const id of awardedIds) if (!nextInventoryIds.includes(id)) nextInventoryIds.push(id);
    delta.inventoryItemIds = nextInventoryIds;
    delta.inventoryItemCount = nextInventoryIds.length;
    delta.warehouseItemIds = (state.warehouseItemIds ?? []).filter((id) => !consumed.has(id));
  }

  // codex_updates
  if (Array.isArray(dmJson["codex_updates"])) {
    const newIds: string[] = [];
    for (const u of dmJson["codex_updates"] as Array<Record<string, unknown>>) {
      const id = typeof u["id"] === "string" ? u["id"] : u["entry_id"];
      if (typeof id === "string") newIds.push(id);
    }
    delta.codexNpcIds = [...new Set([...state.codexNpcIds, ...newIds])];
  }

  if (Array.isArray(dmJson["clue_updates"])) {
    const clueIds = (dmJson["clue_updates"] as Array<Record<string, unknown>>)
      .map((row) => typeof row.id === "string" ? row.id : "")
      .filter(Boolean);
    delta.journalClueIds = [...new Set([...(state.journalClueIds ?? []), ...clueIds])];
  }

  // new_tasks（新增任务 → activeTaskIds）
  if (Array.isArray(dmJson["new_tasks"])) {
    const newTaskIds: string[] = [];
    for (const t of dmJson["new_tasks"] as Array<Record<string, unknown>>) {
      const taskId = typeof t["task_id"] === "string" ? t["task_id"] : t["id"];
      if (typeof taskId === "string") newTaskIds.push(taskId);
    }
    delta.activeTaskIds = [...new Set([...state.activeTaskIds, ...newTaskIds])];
  }

  // task_updates（completed 推进）
  if (Array.isArray(dmJson["task_updates"])) {
    const newlyCompleted: string[] = [];
    for (const u of dmJson["task_updates"] as Array<Record<string, unknown>>) {
      const taskId = typeof u["task_id"] === "string" ? u["task_id"] : u["id"];
      if (u["status"] === "completed" && typeof taskId === "string") {
        newlyCompleted.push(taskId);
      }
    }
    delta.completedTaskIds = [...new Set([...state.completedTaskIds, ...newlyCompleted])];
    if (newlyCompleted.length > 0) {
      const completedSet = new Set(newlyCompleted);
      delta.activeTaskIds = state.activeTaskIds.filter((id) => !completedSet.has(id));
    }
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

  // weapon_updates follows the array wire contract.  Apply rows in order, the
  // same last-writer-wins behavior used by the client store.
  if (Array.isArray(dmJson["weapon_updates"])) {
    const nextBag = (state.weaponBag ?? []).map((weapon) => ({ ...weapon }));
    for (const raw of dmJson["weapon_updates"]) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const wu = raw as Record<string, unknown>;
      if (wu["unequip"] === true) {
        delta.equippedWeapon = null;
        continue;
      }
      if (typeof wu["weaponId"] === "string" && wu["weaponId"]) {
        delta.equippedWeapon = wu["weaponId"];
      }
      if (wu["weapon"] && typeof wu["weapon"] === "object" && !Array.isArray(wu["weapon"])) {
        const weapon = wu["weapon"] as Record<string, unknown>;
        if (typeof weapon.id === "string" && weapon.id) {
          delta.equippedWeapon = weapon.id;
          if (typeof weapon.stability === "number") delta.weaponStability = Math.max(0, Math.min(100, Math.trunc(weapon.stability)));
          if (typeof weapon.contamination === "number") delta.weaponContamination = Math.max(0, Math.min(100, Math.trunc(weapon.contamination)));
        }
      }
      const equipped = delta.equippedWeapon === undefined ? state.equippedWeapon : delta.equippedWeapon;
      if (!equipped) continue;
      if (typeof wu["stability"] === "number" && Number.isFinite(wu["stability"])) {
        delta.weaponStability = Math.max(0, Math.min(100, Math.trunc(wu["stability"])));
      }
      if (typeof wu["contamination"] === "number" && Number.isFinite(wu["contamination"])) {
        delta.weaponContamination = Math.max(0, Math.min(100, Math.trunc(wu["contamination"])));
      }
      const targetId = typeof wu.weaponId === "string" ? wu.weaponId : equipped;
      const bagWeapon = nextBag.find((weapon) => weapon.id === targetId);
      if (bagWeapon) {
        if (typeof wu.stability === "number" && Number.isFinite(wu.stability)) bagWeapon.stability = Math.max(0, Math.min(100, Math.trunc(wu.stability)));
        if (typeof wu.contamination === "number" && Number.isFinite(wu.contamination)) bagWeapon.contamination = Math.max(0, Math.min(100, Math.trunc(wu.contamination)));
        if (typeof wu.repairable === "boolean") bagWeapon.repairable = wu.repairable;
      }
    }
    delta.weaponBag = nextBag;
  }

  // Keep the harness' next client packet aligned with the play client: a
  // world pickup enters weaponBag before it can be equipped on a later turn.
  if (Array.isArray(dmJson["weapon_bag_updates"])) {
    const bag = [...(delta.weaponBag ?? state.weaponBag ?? [])];
    for (const raw of dmJson["weapon_bag_updates"]) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const update = raw as Record<string, unknown>;
      if (typeof update.removeWeaponId === "string") {
        for (let i = bag.length - 1; i >= 0; i -= 1) if (bag[i]?.id === update.removeWeaponId) bag.splice(i, 1);
      }
      const add = update.addWeapon;
      if (add && typeof add === "object" && !Array.isArray(add) && typeof (add as Record<string, unknown>).id === "string") {
        if (!bag.some((weapon) => weapon.id === (add as Record<string, unknown>).id)) bag.push(add as Record<string, unknown>);
      }
    }
    delta.weaponBag = bag;
  }

  if (Array.isArray(dmJson["world_flag_updates"])) {
    delta.unlockedFlags = [...new Set([...state.unlockedFlags, ...dmJson["world_flag_updates"].filter((x): x is string => typeof x === "string")])];
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
  };
}
