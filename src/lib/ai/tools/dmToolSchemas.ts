// src/lib/ai/tools/dmToolSchemas.ts
/**
 * DM Agent 工具 JSON Schema 定义
 *
 * 每个工具都有严格的参数 Schema，用于：
 * 1. 模型 function calling 参数验证
 * 2. 服务端参数校验
 * 3. 文档和类型生成
 */

import type { DmToolMeta, DmToolCategory, DmToolAccess } from "./dmAgentTypes";

// ============================================================
// Schema Builder Helpers
// ============================================================

interface SchemaField {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
  properties?: Record<string, SchemaField>;
  required?: string[];
  default?: unknown;
  additionalProperties?: boolean;
}

function buildToolSchema(
  name: string,
  description: string,
  category: DmToolCategory,
  access: DmToolAccess,
  properties: Record<string, SchemaField>,
  required: string[],
  timeoutMs: number = 3000
): { meta: DmToolMeta; parameters: Record<string, unknown> } {
  return {
    meta: {
      name,
      description,
      category,
      access,
      readonly: access === "read",
      mutatesState: access === "write",
      timeoutMs,
    },
    parameters: {
      type: "object",
      properties: properties as unknown as Record<string, unknown>,
      required,
      additionalProperties: false,
    },
  };
}

// ============================================================
// Read-Only Tools
// ============================================================

/** 获取玩家完整状态 */
export const GET_PLAYER_STATE_SCHEMA = buildToolSchema(
  "get_player_state",
  "获取当前玩家的完整状态信息，包括位置、属性、装备、货币、时间等。用于 DM 了解玩家当前状态后做出决策。",
  "read_player_state",
  "read",
  {
    include_details: {
      type: "boolean",
      description: "是否包含详细属性数据，默认 true",
    },
  },
  []
);

/** 获取背包内容 */
export const GET_INVENTORY_SCHEMA = buildToolSchema(
  "get_inventory",
  "获取玩家背包和仓库中所有物品的列表。用于检查玩家是否拥有特定材料、道具或装备。",
  "read_player_state",
  "read",
  {
    filter_tier: {
      type: "string",
      description: "可选，按品级过滤（S/A/B/C/D）",
      enum: ["S", "A", "B", "C", "D"],
    },
  },
  []
);

/** 获取活跃任务 */
export const GET_ACTIVE_QUESTS_SCHEMA = buildToolSchema(
  "get_active_quests",
  "获取玩家当前所有活跃任务的列表，包括标题、状态、进度和奖励。",
  "read_player_state",
  "read",
  {
    include_completed: {
      type: "boolean",
      description: "是否包含已完成的任务，默认 false",
    },
  },
  []
);

/** 获取世界上下文 */
export const GET_WORLD_CONTEXT_SCHEMA = buildToolSchema(
  "get_world_context",
  "获取当前世界上下文信息，包括时间、楼层危险等级、附近 NPC 和活跃事件。",
  "read_world_state",
  "read",
  {},
  []
);

/** 获取战斗状态 */
export const GET_COMBAT_STATE_SCHEMA = buildToolSchema(
  "get_combat_state",
  "获取当前战斗状态（如果有活跃战斗）。返回敌人信息、玩家状态和可用行动。",
  "read_world_state",
  "read",
  {},
  []
);

/** 检查锻造选项 */
export const INSPECT_FORGE_OPTIONS_SCHEMA = buildToolSchema(
  "inspect_forge_options",
  "检查当前可用的锻造配方和选项。返回玩家能否负担每个配方（原石和材料是否充足）。",
  "read_world_state",
  "read",
  {
    filter_operation: {
      type: "string",
      description: "可选，按操作类型过滤（repair/mod/infuse/weaponize）",
      enum: ["repair", "mod", "infuse", "weaponize"],
    },
  },
  []
);

/** 查询位置信息 */
export const LOOKUP_LOCATION_SCHEMA = buildToolSchema(
  "lookup_location",
  "查询指定地点/房间的详细信息，包括楼层归属、房间节点、描述和威胁等级。替代在 prompt 中硬编码地点数据。",
  "read_world_state",
  "read",
  {
    location_name: {
      type: "string",
      description: "地点名称（如「暗月工坊·铁匠铺」「废都中枢·B3」），支持模糊匹配",
    },
  },
  ["location_name"]
);

/** 查询 NPC 服务/商品 */
export const CHECK_NPC_STOCK_SCHEMA = buildToolSchema(
  "check_npc_stock",
  "查询指定 NPC 提供的服务、商品和锻造选项（如适用）。替代在 prompt 中硬编码 NPC 售卖清单。",
  "read_world_state",
  "read",
  {
    npc_id: {
      type: "string",
      description: "NPC 唯一 ID（如 N-008），必须来自注册表",
    },
  },
  ["npc_id"]
);

// ============================================================
// Write Tools - Quest Operations
// ============================================================

/** 颁发任务 */
export const ISSUE_QUEST_SCHEMA = buildToolSchema(
  "issue_quest",
  "创建一个新任务并添加到玩家的任务列表中。任务必须符合三要素要求：具体动作标题、包含代价/路径的描述、可立即执行的第一步提示。",
  "quest_operation",
  "write",
  {
    title: {
      type: "string",
      description: "任务标题（≤12字，含具体名词和动作，如「替阿织带一件干净的外套」）",
    },
    description: {
      type: "string",
      description: "任务描述（三拍结构：现状+做什么+为什么是现在，≤80字）",
    },
    source_npc_id: {
      type: "string",
      description: "任务来源 NPC ID（如 N-008），无来源可为空字符串",
    },
    next_hint: {
      type: "string",
      description: "可立即执行的第一步提示（必须含具体地点或人物）",
    },
    reward_description: {
      type: "string",
      description: "奖励描述（简洁，如「原石×5」）",
    },
    idempotency_key: {
      type: "string",
      description: "幂等键，用于防止重复创建相同任务。建议格式：quest_{简短描述}_{npcId}",
    },
  },
  ["title", "description", "idempotency_key"]
);

/** 更新任务进度 */
export const UPDATE_QUEST_PROGRESS_SCHEMA = buildToolSchema(
  "update_quest_progress",
  "更新指定任务的进度或状态。用于完成任务、推进进度或标记失败。",
  "quest_operation",
  "write",
  {
    quest_id: {
      type: "string",
      description: "要更新的任务 ID",
    },
    new_status: {
      type: "string",
      description: "新状态",
      enum: ["active", "completed", "failed", "hidden"],
    },
    progress_note: {
      type: "string",
      description: "进度更新说明（≤40字）",
    },
  },
  ["quest_id", "new_status"]
);

// ============================================================
// Write Tools - Forge Operations
// ============================================================

/** 锻造武器 */
export const FORGE_WEAPON_SCHEMA = buildToolSchema(
  "forge_weapon",
  "执行武器锻造/改装/灌注/武器化操作。服务端将验证材料、原石和位置，由确定性规则计算结果。",
  "forge_operation",
  "write",
  {
    recipe_id: {
      type: "string",
      description: "配方 ID（来自 inspect_forge_options 返回的可用配方列表）",
    },
    material_ids: {
      type: "array",
      items: { type: "string" },
      description: "玩家要使用的材料物品 ID 列表",
    },
    weapon_id: {
      type: "string",
      description: "要改装/修复的武器 ID（仅 mod/repair/infuse 操作需要）",
    },
    idempotency_key: {
      type: "string",
      description: "幂等键，格式：forge_{recipeId}_{timestamp}",
    },
  },
  ["recipe_id", "idempotency_key"]
);

// ============================================================
// Write Tools - Inventory Operations
// ============================================================

/** 消耗材料 */
export const CONSUME_MATERIALS_SCHEMA = buildToolSchema(
  "consume_materials",
  "从玩家背包中消耗指定材料。服务端将验证玩家是否实际拥有这些材料。",
  "inventory_operation",
  "write",
  {
    item_ids: {
      type: "array",
      items: { type: "string" },
      description: "要消耗的物品 ID 列表",
    },
    reason: {
      type: "string",
      description: "消耗原因（≤30字），用于日志和叙事",
    },
    idempotency_key: {
      type: "string",
      description: "幂等键",
    },
  },
  ["item_ids", "idempotency_key"]
);

/** 给予物品 */
export const GRANT_ITEM_SCHEMA = buildToolSchema(
  "grant_item",
  "给予玩家一件新物品。服务端将验证物品 ID 的合法性。",
  "inventory_operation",
  "write",
  {
    item_id: {
      type: "string",
      description: "物品 ID（必须来自注册表）",
    },
    source: {
      type: "string",
      description: "物品来源描述（≤30字），如「任务奖励」「从NPC获得」「锻造产出」",
    },
    idempotency_key: {
      type: "string",
      description: "幂等键",
    },
  },
  ["item_id", "idempotency_key"]
);

// ============================================================
// Write Tools - Combat Operations
// ============================================================

/** 开始战斗 */
export const START_COMBAT_SCHEMA = buildToolSchema(
  "start_combat",
  "创建一个新的战斗遭遇。服务端将验证敌人 ID 的合法性并建立战斗状态。",
  "combat_operation",
  "write",
  {
    enemy_npc_id: {
      type: "string",
      description: "敌人 NPC ID（必须来自注册表）",
    },
    reason: {
      type: "string",
      description: "战斗触发原因（≤40字），如「玩家主动攻击」「NPC 敌对」",
    },
    idempotency_key: {
      type: "string",
      description: "幂等键",
    },
  },
  ["enemy_npc_id", "idempotency_key"]
);

/** 结算战斗动作 */
export const RESOLVE_COMBAT_ACTION_SCHEMA = buildToolSchema(
  "resolve_combat_action",
  "结算玩家在战斗中的一个动作。将自然语言动作映射为合法战斗动作，由规则层计算命中、伤害和效果。",
  "combat_operation",
  "write",
  {
    action_description: {
      type: "string",
      description: "玩家战斗动作的自然语言描述（≤80字），如「我跃上桌子刺向他的手腕」",
    },
    action_type: {
      type: "string",
      description: "动作类型",
      enum: ["attack", "defend", "evade", "tactical", "retreat", "item_use"],
    },
    target: {
      type: "string",
      description: "目标描述（如 enemy/npcId）",
    },
  },
  ["action_description", "action_type"]
);

// ============================================================
// Write Tools - World Events
// ============================================================

/** 应用世界事件 */
export const APPLY_WORLD_EVENT_SCHEMA = buildToolSchema(
  "apply_world_event",
  "应用一个世界事件，如楼层变化、NPC 移动、时间推进等。",
  "world_event",
  "write",
  {
    event_type: {
      type: "string",
      description: "事件类型",
      enum: ["npc_move", "location_change", "threat_change", "time_advance", "reveal_unlock"],
    },
    event_data: {
      type: "object",
      description: "事件数据（根据 event_type 不同而不同）",
      properties: {
        npc_id: { type: "string", description: "NPC ID（npc_move 需要）" },
        target_location: { type: "string", description: "目标位置" },
        reason: { type: "string", description: "变化原因（≤30字）" },
      },
      required: [],
      additionalProperties: false,
    },
    idempotency_key: {
      type: "string",
      description: "幂等键",
    },
  },
  ["event_type", "idempotency_key"]
);

// ============================================================
// All Tool Schemas Registry
// ============================================================

/** 所有 DM Agent 工具的 Schema 注册表 */
export const DM_TOOL_SCHEMAS = {
  // Read-only tools
  get_player_state: GET_PLAYER_STATE_SCHEMA,
  get_inventory: GET_INVENTORY_SCHEMA,
  get_active_quests: GET_ACTIVE_QUESTS_SCHEMA,
  get_world_context: GET_WORLD_CONTEXT_SCHEMA,
  get_combat_state: GET_COMBAT_STATE_SCHEMA,
  inspect_forge_options: INSPECT_FORGE_OPTIONS_SCHEMA,
  lookup_location: LOOKUP_LOCATION_SCHEMA,
  check_npc_stock: CHECK_NPC_STOCK_SCHEMA,
  // Write tools - Quest
  issue_quest: ISSUE_QUEST_SCHEMA,
  update_quest_progress: UPDATE_QUEST_PROGRESS_SCHEMA,
  // Write tools - Forge
  forge_weapon: FORGE_WEAPON_SCHEMA,
  // Write tools - Inventory
  consume_materials: CONSUME_MATERIALS_SCHEMA,
  grant_item: GRANT_ITEM_SCHEMA,
  // Write tools - Combat
  start_combat: START_COMBAT_SCHEMA,
  resolve_combat_action: RESOLVE_COMBAT_ACTION_SCHEMA,
  // Write tools - World Events
  apply_world_event: APPLY_WORLD_EVENT_SCHEMA,
} as const;

export type DmToolName = keyof typeof DM_TOOL_SCHEMAS;

/** 所有工具名称列表 */
export const ALL_DM_TOOL_NAMES = Object.keys(DM_TOOL_SCHEMAS) as DmToolName[];

/** 只读工具名称列表 */
export const READONLY_DM_TOOL_NAMES: DmToolName[] = [
  "get_player_state",
  "get_inventory",
  "get_active_quests",
  "get_world_context",
  "get_combat_state",
  "inspect_forge_options",
  "lookup_location",
  "check_npc_stock",
];

/** 状态变更工具名称列表 */
export const WRITE_DM_TOOL_NAMES: DmToolName[] = [
  "issue_quest",
  "update_quest_progress",
  "forge_weapon",
  "consume_materials",
  "grant_item",
  "start_combat",
  "resolve_combat_action",
  "apply_world_event",
];
