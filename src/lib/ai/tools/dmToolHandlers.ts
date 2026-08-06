// src/lib/ai/tools/dmToolHandlers.ts
/**
 * DM Agent 工具处理器
 *
 * 将工具调用映射到 Game Domain Services，执行确定性业务规则。
 * 每个处理器负责：
 * 1. 参数验证
 * 2. 权限检查
 * 3. 业务规则调用
 * 4. 幂等保护
 * 5. 审计日志
 */

import type {
  DmToolResult,
  DmToolRegistration,
  DmAgentContext,
} from "./dmAgentTypes";
import { DM_TOOL_SCHEMAS } from "./dmToolSchemas";
import {
  createQuest,
  executeForge,
  initiateCombat,
  resolvePlayerCombatAction,
  applyWorldEvent,
  buildIdempotencyKey,
  checkIdempotency,
  recordIdempotency,
} from "./gameDomainServices";
import { ITEMS } from "@/lib/registry/items";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import { MAP_ROOMS, FLOORS, NPC_EXCLUSIVE_ITEMS, ENTITY_CARRIED_ITEMS } from "@/lib/registry/world";
import { NPCS } from "@/lib/registry/npcs";
import { FLOOR_LORE_BY_ID } from "@/lib/registry/floorLoreRegistry";

import {
  buildServerPlayerStateSnapshot,
  buildServerInventorySnapshot,
  buildServerActiveQuestSnapshot,
  buildServerWorldContextSnapshot,
  buildServerCombatStateSnapshot,
  buildServerForgeOptionsSnapshot,
} from "./dmServerStateAdapter";

import type { ToolDefinition } from "@/lib/ai/types/core";

// ============================================================
// Handler Context Factory
// ============================================================

/** 从当前游戏状态构建处理器上下文 */
function getServerState(ctx: DmAgentContext) {
  return ctx.serverGameState ?? null;
}

// ============================================================
// Read-Only Tool Handlers
// ============================================================

async function handleGetPlayerState(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  const ss = getServerState(ctx);
  if (!ss) {
    return { ok: false, error: "无法获取玩家状态", code: "internal_error", narrativeContext: "系统暂时无法获取玩家状态" };
  }
  const snapshot = buildServerPlayerStateSnapshot(ss);
  return {
    ok: true,
    data: snapshot,
    narrativeContext: `玩家位于 ${snapshot.location}，原石 ${snapshot.originium}，理智 ${snapshot.sanity}`,
  };
}

async function handleGetInventory(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  const ss = getServerState(ctx);
  if (!ss) {
    return { ok: false, error: "无法获取背包", code: "internal_error", narrativeContext: "系统暂时无法获取背包信息" };
  }
  const snapshot = buildServerInventorySnapshot(ss);
  const itemCount = snapshot.items.length;
  const warehouseCount = snapshot.warehouseItems.length;
  return {
    ok: true,
    data: snapshot,
    narrativeContext: `背包中有 ${itemCount} 件物品，仓库中有 ${warehouseCount} 件物品`,
  };
}

async function handleGetActiveQuests(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  const ss = getServerState(ctx);
  if (!ss) {
    return { ok: false, error: "无法获取任务", code: "internal_error", narrativeContext: "系统暂时无法获取任务信息" };
  }
  const snapshot = buildServerActiveQuestSnapshot(ss);
  const activeCount = snapshot.quests.length;
  return {
    ok: true,
    data: snapshot,
    narrativeContext: activeCount > 0
      ? `当前有 ${activeCount} 个活跃任务`
      : "当前没有活跃任务",
  };
}

async function handleGetWorldContext(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  const ss = getServerState(ctx);
  if (!ss) {
    return { ok: false, error: "无法获取世界上下文", code: "internal_error", narrativeContext: "系统暂时无法获取世界信息" };
  }
  const snapshot = buildServerWorldContextSnapshot(ss);
  const timeLabel = snapshot.timeOfDay === "night" ? "夜晚" : "白天";
  return {
    ok: true,
    data: snapshot,
    narrativeContext: `当前是${timeLabel}，楼层危险等级：${snapshot.floorDangerLevel}。附近 NPC：${snapshot.nearbyNpcs.join(", ") || "无"}`,
  };
}

async function handleGetCombatState(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  const ss = getServerState(ctx);
  if (!ss) {
    return { ok: false, error: "无法获取战斗状态", code: "internal_error", narrativeContext: "系统暂时无法获取战斗状态" };
  }
  const snapshot = buildServerCombatStateSnapshot(ss);
  if (!snapshot.isInCombat) {
    return { ok: true, data: snapshot, narrativeContext: "当前没有活跃战斗" };
  }
  return {
    ok: true,
    data: snapshot,
    narrativeContext: `正在与 ${snapshot.enemy?.name} 战斗。玩家状态：${snapshot.playerStatus}`,
  };
}

async function handleInspectForgeOptions(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  const ss = getServerState(ctx);
  if (!ss) {
    return { ok: false, error: "无法获取锻造选项", code: "internal_error", narrativeContext: "系统暂时无法获取锻造信息" };
  }
  const snapshot = buildServerForgeOptionsSnapshot(ss);
  const availableCount = snapshot.availableRecipes.filter((r) => r.canAfford && r.hasMaterials).length;
  const locationNote = snapshot.isAtForgeLocation
    ? "你正在 B1 配电间锻造台前"
    : "你需要前往 B1 配电间才能进行锻造";
  return {
    ok: true,
    data: snapshot,
    narrativeContext: `${locationNote}。有 ${availableCount} 个可执行的配方（共 ${snapshot.availableRecipes.length} 个）。当前原石：${snapshot.playerOriginium}`,
  };
}

async function handleLookupLocation(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  const locationName = String(args.location_name ?? "").trim();
  if (!locationName) {
    return {
      ok: false,
      error: "地点名称不能为空",
      code: "validation_error",
      narrativeContext: "请提供要查询的地点名称",
    };
  }

  const query = locationName.toLowerCase();

  // 1) 尝试精确匹配 MAP_ROOMS 中的 room node
  let matchedFloor: string | null = null;
  let matchedRooms: string[] = [];

  for (const [floorId, rooms] of Object.entries(MAP_ROOMS)) {
    for (const room of rooms) {
      const roomLower = room.toLowerCase();
      if (roomLower === query || roomLower.includes(query)) {
        matchedFloor = floorId;
        matchedRooms.push(room);
      }
    }
    if (matchedRooms.length > 0) break; // 第一个匹配到的楼层就返回
  }

  // 2) 如果没有精确匹配到 room，尝试匹配 FLOORS 描述
  if (matchedRooms.length === 0) {
    for (const floor of FLOORS) {
      const floorLabel = floor.label.toLowerCase();
      const floorDesc = floor.description.toLowerCase();
      if (floorLabel.includes(query) || floorDesc.includes(query) || floor.id.toLowerCase() === query) {
        matchedFloor = floor.id;
        matchedRooms = [...(MAP_ROOMS[floor.id] ?? [])];
        break;
      }
    }
  }

  // 3) 模糊匹配 MAP_ROOMS key
  if (matchedRooms.length === 0) {
    for (const [floorId, rooms] of Object.entries(MAP_ROOMS)) {
      const floorKey = floorId.toLowerCase();
      if (floorKey.includes(query) || query.includes(floorKey)) {
        matchedFloor = floorId;
        matchedRooms = [...rooms];
        break;
      }
    }
  }

  if (!matchedFloor || matchedRooms.length === 0) {
    return {
      ok: false,
      error: `未找到匹配的地点：「${locationName}」`,
      code: "validation_error",
      narrativeContext: `数据库中未找到与「${locationName}」匹配的地点信息`,
    };
  }

  // 获取楼层描述
  const floorInfo = FLOORS.find((f) => f.id === matchedFloor);
  const description = floorInfo?.description ?? `${matchedFloor} 楼层`;

  // 获取威胁信息
  const floorLore = FLOOR_LORE_BY_ID[matchedFloor as keyof typeof FLOOR_LORE_BY_ID];
  const threats = floorLore
    ? { linkedAnomaly: floorLore.linkedAnomalyId, mainThreat: floorLore.mainThreatMapping }
    : { linkedAnomaly: null, mainThreat: "未知" };

  return {
    ok: true,
    data: {
      floorId: matchedFloor,
      floorLabel: floorInfo?.label ?? matchedFloor,
      description,
      roomNodes: matchedRooms,
      threats,
    },
    narrativeContext: `${floorInfo?.label ?? matchedFloor}，共 ${matchedRooms.length} 个房间节点。${threats.linkedAnomaly ? `关联异常：${threats.linkedAnomaly}。` : ""}`,
  };
}

async function handleCheckNpcStock(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  const npcId = String(args.npc_id ?? "").trim();
  if (!npcId) {
    return {
      ok: false,
      error: "NPC ID 不能为空",
      code: "validation_error",
      narrativeContext: "请提供要查询的 NPC ID",
    };
  }

  // 在 NPCS 注册表中查找
  const npc = NPCS.find((n) => n.id === npcId);
  if (!npc) {
    return {
      ok: false,
      error: `未找到 NPC：「${npcId}」`,
      code: "invalid_target",
      narrativeContext: `注册表中未找到 ID 为「${npcId}」的 NPC`,
    };
  }

  // 获取 NPC 专属物品
  const exclusiveItem = NPC_EXCLUSIVE_ITEMS[npcId] ?? null;

  // 获取 NPC 携带的可掉落物品
  const carriedItems = ENTITY_CARRIED_ITEMS[npcId] ?? [];

  return {
    ok: true,
    data: {
      npcId: npc.id,
      name: npc.name,
      location: npc.location,
      floor: npc.floor,
      personality: npc.personality,
      specialty: npc.specialty,
      combatPower: npc.combatPower,
      defaultFavorability: npc.defaultFavorability,
      exclusiveItem,
      carriedItemIds: carriedItems,
      lore: npc.lore,
    },
    narrativeContext: `${npc.name}（${npcId}），位于 ${npc.location}。专长：${npc.specialty}。${exclusiveItem ? `专属物品：${exclusiveItem}。` : ""}可掉落 ${carriedItems.length} 件物品。`,
  };
}

// ============================================================
// Write Tool Handlers - Quest
// ============================================================

async function handleIssueQuest(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  return createQuest({
    title: String(args.title ?? ""),
    description: String(args.description ?? ""),
    sourceNpcId: args.source_npc_id ? String(args.source_npc_id) : undefined,
    nextHint: args.next_hint ? String(args.next_hint) : undefined,
    rewardDescription: args.reward_description ? String(args.reward_description) : undefined,
    idempotencyKey: String(args.idempotency_key ?? `quest_${Date.now()}`),
  });
}

async function handleUpdateQuestProgress(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  const questId = String(args.quest_id ?? "");
  const newStatus = String(args.new_status ?? "");
  const progressNote = args.progress_note ? String(args.progress_note) : "";

  if (!questId) {
    return { ok: false, error: "任务 ID 不能为空", code: "validation_error", narrativeContext: "请提供要更新的任务 ID" };
  }

  const validStatuses = ["active", "completed", "failed", "hidden"];
  if (!validStatuses.includes(newStatus)) {
    return {
      ok: false,
      error: `无效的任务状态：${newStatus}`,
      code: "validation_error",
      narrativeContext: "任务状态必须是 active/completed/failed/hidden 之一",
    };
  }

  // 实际实现中需要操作 store
  return {
    ok: true,
    data: { questId, newStatus, progressNote },
    narrativeContext: `任务状态已更新为「${newStatus}」${progressNote ? `：${progressNote}` : ""}`,
  };
}

// ============================================================
// Write Tool Handlers - Forge
// ============================================================

async function handleForgeWeapon(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  const ss = getServerState(ctx);
  if (!ss) {
    return { ok: false, error: "无法执行锻造", code: "internal_error", narrativeContext: "系统暂时无法执行锻造操作" };
  }

  // 从 server state 构建简化的 forge state
  const cs = ss.clientState;
  const forgeState = {
    originium: cs?.originium ?? 0,
    playerLocation: cs?.playerLocation ?? "unknown",
    inventory: (cs?.inventoryItemIds ?? []).map((id) => ({
      id,
      tags: [] as string[],
      tier: "D" as const,
      name: id,
    })),
  };

  return executeForge(
    {
      recipeId: String(args.recipe_id ?? ""),
      materialIds: Array.isArray(args.material_ids) ? args.material_ids.map(String) : undefined,
      weaponId: args.weapon_id ? String(args.weapon_id) : undefined,
      idempotencyKey: String(args.idempotency_key ?? `forge_${Date.now()}`),
    },
    forgeState
  );
}

// ============================================================
// Write Tool Handlers - Inventory
// ============================================================

async function handleConsumeMaterials(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  const itemIds: string[] = Array.isArray(args.item_ids)
    ? args.item_ids.map(String)
    : [];
  const idempotencyKey = buildIdempotencyKey(
    ctx.requestId,
    `consume:${String(args.idempotency_key ?? `consume_${Date.now()}`)}`
  );

  if (itemIds.length === 0) {
    return { ok: false, error: "物品 ID 列表不能为空", code: "validation_error", narrativeContext: "请提供要消耗的物品 ID" };
  }

  // 幂等检查
  const existing = checkIdempotency(idempotencyKey);
  if (existing) return existing;

  const ss = getServerState(ctx);
  if (!ss) {
    return { ok: false, error: "无法消耗材料", code: "internal_error", narrativeContext: "系统暂时无法消耗材料" };
  }

  // 检查玩家是否拥有这些物品（基于 clientState inventoryItemIds）
  const ownedIds = new Set(ss.clientState?.inventoryItemIds ?? []);
  const missingIds = itemIds.filter((id) => !ownedIds.has(id));
  if (missingIds.length > 0) {
    return {
      ok: false,
      error: `物品不存在：${missingIds.join(", ")}`,
      code: "insufficient_materials",
      narrativeContext: `背包中没有以下物品：${missingIds.join(", ")}`,
    };
  }

  const result: DmToolResult = {
    ok: true,
    data: { consumedItems: itemIds, reason: String(args.reason ?? "消耗材料") },
    narrativeContext: `已消耗 ${itemIds.length} 件材料`,
  };

  recordIdempotency(idempotencyKey, result, ctx.requestId);
  return result;
}

async function handleGrantItem(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  const itemId = String(args.item_id ?? "");
  const source = String(args.source ?? "系统奖励");
  const idempotencyKey = buildIdempotencyKey(
    ctx.requestId,
    `grant:${String(args.idempotency_key ?? `grant_${Date.now()}`)}`
  );

  if (!itemId) {
    return { ok: false, error: "物品 ID 不能为空", code: "validation_error", narrativeContext: "请提供要给予的物品 ID" };
  }

  // T13: 接入物品注册表校验
  const knownItem = ITEMS.find((i) => i.id === itemId);
  const knownWarehouseItem = WAREHOUSE_ITEMS.find((i) => i.id === itemId);

  if (!knownItem && !knownWarehouseItem) {
    return {
      ok: false,
      error: `物品 ${itemId} 不在注册表中`,
      code: "validation_error",
      narrativeContext: `无法获得未知物品，请使用 inspect_forge_options 或 get_inventory 查询可用物品`,
    };
  }

  const itemName = knownItem?.name ?? knownWarehouseItem?.name ?? itemId;

  // 幂等检查
  const existing = checkIdempotency(idempotencyKey);
  if (existing) return existing;

  const result: DmToolResult = {
    ok: true,
    data: {
      itemId,
      itemName,
      source,
      granted: true,
    },
    narrativeContext: `获得物品：${itemName}`,
  };

  recordIdempotency(idempotencyKey, result, ctx.requestId);
  return result;
}

// ============================================================
// Write Tool Handlers - Combat
// ============================================================

async function handleStartCombat(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx; // reserved for future NPC profile validation
  // T11: 接入 NPC 注册表校验
  const enemyNpcId = String(args.enemy_npc_id ?? "");
  if (!enemyNpcId.startsWith("N-")) {
    return {
      ok: false,
      error: `无效的 NPC ID：${enemyNpcId}`,
      code: "invalid_target",
      narrativeContext: "请提供有效的 NPC ID（如 N-XXX）",
    };
  }
  return initiateCombat({
    enemyNpcId,
    reason: String(args.reason ?? "战斗触发"),
    idempotencyKey: String(args.idempotency_key ?? `combat_${Date.now()}`),
  });
}

async function handleResolveCombatAction(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  // T11: 接入真实 combat adjudication 系统，传递服务端状态和 NPC ID
  const serverState = ctx.serverGameState ?? null;
  const targetNpcId = args.target ? String(args.target) : undefined;
  return resolvePlayerCombatAction({
    actionDescription: String(args.action_description ?? ""),
    actionType: String(args.action_type ?? "attack"),
    target: args.target ? String(args.target) : undefined,
    targetNpcId,
    serverState,
  });
}

// ============================================================
// Write Tool Handlers - World Events
// ============================================================

async function handleApplyWorldEvent(
  args: Record<string, unknown>,
  ctx: DmAgentContext
): Promise<DmToolResult> {
  void ctx;
  return applyWorldEvent({
    eventType: String(args.event_type ?? ""),
    eventData: args.event_data as Record<string, unknown> | undefined,
    idempotencyKey: String(args.idempotency_key ?? `event_${Date.now()}`),
  });
}

// ============================================================
// Tool Registry Assembly
// ============================================================

/** 构建工具定义（用于发送给模型） */
function buildToolDefinition(schemaName: string): ToolDefinition {
  const schema = DM_TOOL_SCHEMAS[schemaName as keyof typeof DM_TOOL_SCHEMAS];
  return {
    type: "function",
    function: {
      name: schema.meta.name,
      description: schema.meta.description,
      parameters: schema.parameters,
    },
  };
}

/** 所有 DM Agent 工具的注册表 */
export const DM_TOOL_REGISTRY: Record<string, DmToolRegistration> = {
  // Read-only tools
  get_player_state: {
    meta: DM_TOOL_SCHEMAS.get_player_state.meta,
    definition: buildToolDefinition("get_player_state"),
    handler: handleGetPlayerState,
  },
  get_inventory: {
    meta: DM_TOOL_SCHEMAS.get_inventory.meta,
    definition: buildToolDefinition("get_inventory"),
    handler: handleGetInventory,
  },
  get_active_quests: {
    meta: DM_TOOL_SCHEMAS.get_active_quests.meta,
    definition: buildToolDefinition("get_active_quests"),
    handler: handleGetActiveQuests,
  },
  get_world_context: {
    meta: DM_TOOL_SCHEMAS.get_world_context.meta,
    definition: buildToolDefinition("get_world_context"),
    handler: handleGetWorldContext,
  },
  get_combat_state: {
    meta: DM_TOOL_SCHEMAS.get_combat_state.meta,
    definition: buildToolDefinition("get_combat_state"),
    handler: handleGetCombatState,
  },
  inspect_forge_options: {
    meta: DM_TOOL_SCHEMAS.inspect_forge_options.meta,
    definition: buildToolDefinition("inspect_forge_options"),
    handler: handleInspectForgeOptions,
  },
  lookup_location: {
    meta: DM_TOOL_SCHEMAS.lookup_location.meta,
    definition: buildToolDefinition("lookup_location"),
    handler: handleLookupLocation,
  },
  check_npc_stock: {
    meta: DM_TOOL_SCHEMAS.check_npc_stock.meta,
    definition: buildToolDefinition("check_npc_stock"),
    handler: handleCheckNpcStock,
  },
  // Write tools - Quest
  issue_quest: {
    meta: DM_TOOL_SCHEMAS.issue_quest.meta,
    definition: buildToolDefinition("issue_quest"),
    handler: handleIssueQuest,
  },
  update_quest_progress: {
    meta: DM_TOOL_SCHEMAS.update_quest_progress.meta,
    definition: buildToolDefinition("update_quest_progress"),
    handler: handleUpdateQuestProgress,
  },
  // Write tools - Forge
  forge_weapon: {
    meta: DM_TOOL_SCHEMAS.forge_weapon.meta,
    definition: buildToolDefinition("forge_weapon"),
    handler: handleForgeWeapon,
  },
  // Write tools - Inventory
  consume_materials: {
    meta: DM_TOOL_SCHEMAS.consume_materials.meta,
    definition: buildToolDefinition("consume_materials"),
    handler: handleConsumeMaterials,
  },
  grant_item: {
    meta: DM_TOOL_SCHEMAS.grant_item.meta,
    definition: buildToolDefinition("grant_item"),
    handler: handleGrantItem,
  },
  // Write tools - Combat
  start_combat: {
    meta: DM_TOOL_SCHEMAS.start_combat.meta,
    definition: buildToolDefinition("start_combat"),
    handler: handleStartCombat,
  },
  resolve_combat_action: {
    meta: DM_TOOL_SCHEMAS.resolve_combat_action.meta,
    definition: buildToolDefinition("resolve_combat_action"),
    handler: handleResolveCombatAction,
  },
  // Write tools - World Events
  apply_world_event: {
    meta: DM_TOOL_SCHEMAS.apply_world_event.meta,
    definition: buildToolDefinition("apply_world_event"),
    handler: handleApplyWorldEvent,
  },
} as const;

/** 获取所有工具定义（用于发送给模型） */
export function getDmToolDefinitions(): ToolDefinition[] {
  return Object.values(DM_TOOL_REGISTRY).map((reg) => reg.definition);
}

/** 获取只读工具定义 */
export function getReadonlyDmToolDefinitions(): ToolDefinition[] {
  const readonlyNames = new Set([
    "get_player_state",
    "get_inventory",
    "get_active_quests",
    "get_world_context",
    "get_combat_state",
    "inspect_forge_options",
    "lookup_location",
    "check_npc_stock",
  ]);
  return Object.entries(DM_TOOL_REGISTRY)
    .filter(([name]) => readonlyNames.has(name))
    .map(([, reg]) => reg.definition);
}

/** 获取状态变更工具定义 */
export function getWriteDmToolDefinitions(): ToolDefinition[] {
  const writeNames = new Set([
    "issue_quest",
    "update_quest_progress",
    "forge_weapon",
    "consume_materials",
    "grant_item",
    "start_combat",
    "resolve_combat_action",
    "apply_world_event",
  ]);
  return Object.entries(DM_TOOL_REGISTRY)
    .filter(([name]) => writeNames.has(name))
    .map(([, reg]) => reg.definition);
}
