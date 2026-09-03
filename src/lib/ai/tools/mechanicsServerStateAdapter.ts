// src/lib/ai/tools/mechanicsServerStateAdapter.ts
/**
 * 服务端状态适配器
 *
 * 将 /api/chat 路由中的服务端状态（clientState + sessionMemory）
 * 适配为 Mechanics Workflow 工具所需的领域查询格式。
 *
 * 设计原则：
 * - 不依赖客户端 Zustand store（服务端无法访问）
 * - 以 clientState (ClientStructuredContextV1) 为主要真相源
 * - 以 sessionMemory 为补充（用于 NPC 状态、世界事件等）
 * - 所有数据经过服务端白名单校验
 */

import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";
import type {
  PlayerStateSnapshot,
  InventorySnapshot,
  ActiveQuestSnapshot,
  WorldContextSnapshot,
  CombatStateSnapshot,
  ForgeOptionsSnapshot,
} from "./mechanicsTypes";
import type { SessionMemoryForDm } from "@/lib/memoryCompress";
import { LIGHT_FORGE_RECIPES, type LightForgeRecipe } from "@/lib/registry/forge";

// ============================================================
// State Adapter
// ============================================================

export interface ServerGameState {
  clientState: ClientStructuredContextV1 | null;
  sessionMemory: SessionMemoryForDm | null;
  /** 当前请求的原始玩家输入 */
  latestUserInput: string;
  /** 会话总回合数 */
  totalRounds: number;
}

/**
 * 从服务端状态构建玩家状态快照
 */
export function buildServerPlayerStateSnapshot(state: ServerGameState): PlayerStateSnapshot {
  const cs = state.clientState;
  const location = cs?.playerLocation ?? "unknown";

  return {
    playerName: "玩家",
    location,
    floor: extractFloor(location),
    stats: {
      sanity: cs?.stats?.sanity ?? 100,
      agility: cs?.stats?.agility ?? 10,
      luck: cs?.stats?.luck ?? 10,
      charm: cs?.stats?.charm ?? 10,
      background: cs?.stats?.background ?? 0,
    },
    sanity: cs?.stats?.sanity ?? 100,
    hp: undefined, // 服务端无 HP 字段
    originium: cs?.originium ?? 0,
    equippedWeapon: cs?.equippedWeapon
      ? {
          id: (cs.equippedWeapon as any)?.id ?? "unknown",
          name: (cs.equippedWeapon as any)?.name ?? "未知武器",
          tier: (cs.equippedWeapon as any)?.tier ?? "C",
          mods: (cs.equippedWeapon as any)?.mods?.map((m: any) => m.kind) ?? [],
        }
      : null,
    deathCount: 0,
    time: {
      day: cs?.time?.day ?? 1,
      hour: cs?.time?.hour ?? 14,
    },
    talent: cs?.currentProfession ?? null,
  };
}

/**
 * 从服务端状态构建背包快照
 */
export function buildServerInventorySnapshot(state: ServerGameState): InventorySnapshot {
  const cs = state.clientState;
  const equippedId = cs?.equippedWeapon ? (cs.equippedWeapon as any)?.id : null;

  return {
    items: (cs?.inventoryItemIds ?? []).map((id) => ({
      id,
      name: id, // 服务端无名称映射，传 ID
      tier: "D",
      quantity: 1,
      isEquipped: id === equippedId,
    })),
    warehouseItems: (cs?.warehouseItemIds ?? []).map((id) => ({
      id,
      name: id,
      tier: "D",
      quantity: 1,
      effectSummary: "",
    })),
  };
}

/**
 * 从服务端状态构建活跃任务快照
 */
export function buildServerActiveQuestSnapshot(state: ServerGameState): ActiveQuestSnapshot {
  const cs = state.clientState;

  return {
    quests: (cs?.activeTaskIds ?? []).map((id) => ({
      id,
      title: id,
      status: "active",
      progress: "进行中",
      reward: "未知",
    })),
  };
}

/**
 * 从服务端状态构建世界上下文快照
 */
export function buildServerWorldContextSnapshot(state: ServerGameState): WorldContextSnapshot {
  const cs = state.clientState;
  const hour = cs?.time?.hour ?? 14;
  const isNight = hour >= 18 || hour < 6;

  const threatIds = cs?.activeThreatIds ?? [];

  let floorDangerLevel = "安全";
  if (threatIds.length > 0) floorDangerLevel = "危险";

  return {
    timeOfDay: isNight ? "night" : "day",
    floorDangerLevel,
    nearbyNpcs: cs?.presentNpcIds ?? [],
    activeEvents: threatIds,
  };
}

/**
 * 从服务端状态构建战斗状态快照
 */
export function buildServerCombatStateSnapshot(state: ServerGameState): CombatStateSnapshot {
  const cs = state.clientState;
  const threatIds = cs?.activeThreatIds ?? [];

  if (threatIds.length === 0) {
    return {
      isInCombat: false,
      playerStatus: "无活跃战斗",
      availableActions: [],
    };
  }

  return {
    isInCombat: true,
    enemy: {
      name: threatIds[0],
      threat: "未知",
      status: "活跃",
    },
    playerStatus: `理智: ${cs?.stats?.sanity ?? 100} | 原石: ${cs?.originium ?? 0}`,
    availableActions: ["attack", "defend", "evade", "tactical", "retreat", "item_use"],
  };
}

/**
 * 从服务端状态构建锻造选项快照
 */
export function buildServerForgeOptionsSnapshot(state: ServerGameState): ForgeOptionsSnapshot {
  const cs = state.clientState;
  const playerOriginium = cs?.originium ?? 0;
  const playerLocation = cs?.playerLocation ?? "unknown";
  const isAtForge = playerLocation === "B1_PowerRoom";
  const playerItemIds = new Set(cs?.inventoryItemIds ?? []);

  const availableRecipes = LIGHT_FORGE_RECIPES.map((recipe: LightForgeRecipe) => {
    const canAfford = playerOriginium >= (recipe.costOriginium ?? 0);
    // 检查材料标签：检查 inventory 中是否有匹配标签的物品
    // 由于服务端只知道 item IDs 不知道 tags，这里用简化判断
    const hasMaterials = (recipe.requiredMaterialTags ?? []).length === 0 || playerItemIds.size > 0;

    return {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      costOriginium: recipe.costOriginium ?? 0,
      requiredMaterials: (recipe.requiredMaterialTags ?? []) as string[],
      canAfford,
      hasMaterials,
    };
  });

  return {
    availableRecipes,
    playerOriginium,
    playerLocation,
    isAtForgeLocation: isAtForge,
  };
}

// ============================================================
// Helpers
// ============================================================

function extractFloor(location: string): string {
  // Extract floor number from location string like "B1_PowerRoom" → "B1"
  const match = location.match(/^[BF]?\d+/);
  return match ? match[0] : "unknown";
}
