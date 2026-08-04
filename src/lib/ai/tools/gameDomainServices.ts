// src/lib/ai/tools/gameDomainServices.ts
/**
 * Game Domain Services
 *
 * 确定性业务规则层。模型不能直接计算最终属性、成功率、伤害或奖励。
 * 所有游戏状态变更都必须经过这里的服务端验证。
 */

import type {
  DmToolResult,
  DmToolErrorCode,
  PlayerStateSnapshot,
  InventorySnapshot,
  ActiveQuestSnapshot,
  WorldContextSnapshot,
  CombatStateSnapshot,
  ForgeOptionsSnapshot,
} from "./dmAgentTypes";
import type { GameState } from "@/store/useGameStore";
import type { Item } from "@/lib/registry/types";
import { LIGHT_FORGE_RECIPES, type LightForgeRecipe } from "@/lib/registry/forge";
// import { resolveCombat } from "@/lib/combat/resolveCombat"; // not currently used, import removed
// import type { NpcCombatStoryClass } from "@/lib/combat/types"; // not currently used

// === Real Combat Integration (T11) ===
import { computePlayerCombatScore } from "@/lib/combat/playerCombatScore";
import { computeNpcCombatScore } from "@/lib/combat/combatAdjudication";
import { resolveCombat } from "@/lib/combat/resolveCombat";
import { getHiddenNpcCombatProfile } from "@/lib/combat/npcCombatProfiles";
import type {
  CombatConflictKind,
  CombatResolution,
  SceneCombatContext,
  MainThreatPhase,
} from "@/lib/combat/types";
import type { StatType } from "@/lib/registry/types";

// ============================================================
// Idempotency (T12: requestId-scoped + TTL cleanup)
// ============================================================

interface IdempotencyEntry {
  result: DmToolResult;
  timestamp: number;
  requestId: string;
}

/** 幂等键去重存储（按 requestId 命名空间隔离） */
const idempotencyStore = new Map<string, IdempotencyEntry>();

/** 最大条目数（超限时 LRU 淘汰） */
const MAX_IDEMPOTENCY_ENTRIES = 500;

/** TTL：10 分钟后自动过期 */
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

/** 定期清理过期条目（每 5 分钟最多执行一次） */
let lastCleanupAt = 0;

function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanupAt < 5 * 60 * 1000) return;
  lastCleanupAt = now;
  for (const [key, entry] of idempotencyStore) {
    if (now - entry.timestamp > IDEMPOTENCY_TTL_MS) {
      idempotencyStore.delete(key);
    }
  }
}

/** 构建带 requestId 命名空间的幂等键 */
export function buildIdempotencyKey(requestId: string, toolKey: string): string {
  return `${requestId}:${toolKey}`;
}

/** 检查幂等键是否已处理（按 requestId 隔离，防止跨请求冲突） */
export function checkIdempotency(key: string): DmToolResult | null {
  cleanupExpiredEntries();
  const entry = idempotencyStore.get(key);
  if (entry) {
    if (Date.now() - entry.timestamp < IDEMPOTENCY_TTL_MS) {
      return entry.result;
    }
    idempotencyStore.delete(key);
  }
  return null;
}

/** 记录幂等结果 */
export function recordIdempotency(key: string, result: DmToolResult, requestId?: string): void {
  cleanupExpiredEntries();
  // LRU 淘汰
  if (idempotencyStore.size >= MAX_IDEMPOTENCY_ENTRIES) {
    const oldest = idempotencyStore.keys().next();
    if (!oldest.done) idempotencyStore.delete(oldest.value);
  }
  idempotencyStore.set(key, {
    result,
    timestamp: Date.now(),
    requestId: requestId ?? "unknown",
  });
}

/** 测试辅助：清空幂等存储 */
export function __resetIdempotencyStore(): void {
  idempotencyStore.clear();
  lastCleanupAt = 0;
}

// ============================================================
// Player State Queries
// ============================================================

/** 构建玩家状态快照 */
export function buildPlayerStateSnapshot(state: GameState): PlayerStateSnapshot {
  return {
    playerName: state.playerName || "玩家",
    location: state.playerLocation || "unknown",
    floor: state.playerLocation?.replace(/[^BF\d]/g, "") || "unknown",
    stats: { ...state.stats },
    sanity: state.stats.sanity ?? 100,
    hp: (state.stats as any).hp as number | undefined,
    originium: state.originium ?? 0,
    equippedWeapon: state.equippedWeapon
      ? {
          id: state.equippedWeapon.id,
          name: state.equippedWeapon.name,
          tier: (state.equippedWeapon as any).tier ?? "C",
          mods: (state.equippedWeapon as any)?.mods?.map((m: any) => m.kind) ?? [],
        }
      : null,
    deathCount: state.deathCount ?? 0,
    time: {
      day: state.time?.day ?? 0,
      hour: state.time?.hour ?? 8,
    },
    talent: state.talent ?? null,
  };
}

/** 构建背包快照 */
export function buildInventorySnapshot(state: GameState): InventorySnapshot {
  return {
    items: (state.inventory ?? []).map((item: Item) => ({
      id: item.id,
      name: item.name,
      tier: (item as any).tier ?? "D",
      quantity: 1,
      isEquipped: state.equippedWeapon?.id === item.id,
    })),
    warehouseItems: (state.warehouse ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      tier: (item as any).tier ?? "D",
      quantity: 1,
      effectSummary: (item as any).effectSummary ?? "",
    })),
  };
}

/** 构建活跃任务快照 */
export function buildActiveQuestSnapshot(state: GameState): ActiveQuestSnapshot {
  return {
    quests: (state.tasks ?? [])
      .filter((t: any) => t.status === "active")
      .map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        progress: t.progress ?? "未开始",
        reward: t.reward ?? "未知",
      })),
  };
}

/** 构建世界上下文快照 */
export function buildWorldContextSnapshot(state: GameState): WorldContextSnapshot {
  const hour = state.time?.hour ?? 8;
  const isNight = hour >= 18 || hour < 6;

  const currentFloor = state.playerLocation?.replace(/[^BF\d]/g, "") || "1";
  const threat = state.mainThreatByFloor?.[currentFloor]?.phase ?? "idle";

  const dangerMap: Record<string, string> = {
    idle: "安全",
    active: "危险",
    suppressed: "受压制",
    breached: "已突破",
  };

  const nearbyNpcs: string[] = [];
  if (state.dynamicNpcStates) {
    for (const [npcId, npcState] of Object.entries(state.dynamicNpcStates)) {
      if (npcState.currentLocation === state.playerLocation) {
        nearbyNpcs.push(npcId);
      }
    }
  }

  return {
    timeOfDay: isNight ? "night" : "day",
    floorDangerLevel: dangerMap[threat] ?? "未知",
    nearbyNpcs,
    activeEvents: [],
  };
}

/** 构建战斗状态快照 */
export function buildCombatStateSnapshot(state: GameState): CombatStateSnapshot {
  // 检查是否有活跃战斗（通过 combat 相关状态）
  const hasCombat = false; // 实际需从 combat state 读取

  if (!hasCombat) {
    return {
      isInCombat: false,
      playerStatus: "无活跃战斗",
      availableActions: [],
    };
  }

  return {
    isInCombat: true,
    enemy: {
      name: "未知",
      threat: "未知",
      status: "未知",
    },
    playerStatus: `理智: ${state.stats.sanity ?? 100}`,
    availableActions: ["attack", "defend", "evade", "tactical", "retreat", "item_use"],
  };
}

/** 构建锻造选项快照 */
export function buildForgeOptionsSnapshot(state: GameState): ForgeOptionsSnapshot {
  const playerOriginium = state.originium ?? 0;
  const isAtForge = state.playerLocation === "B1_PowerRoom";
  const playerItemIds = new Set((state.inventory ?? []).map((i: Item) => i.id));
  void playerItemIds;

  const availableRecipes = LIGHT_FORGE_RECIPES.map((recipe: LightForgeRecipe) => {
    const canAfford = playerOriginium >= (recipe.costOriginium ?? 0);
    const hasMaterials = (recipe.requiredMaterialTags ?? []).every((tag: string) => {
      // 简化检查：检查玩家是否有带对应标签的物品
      return (state.inventory ?? []).some((item: Item) =>
        item.tags?.includes(tag)
      );
    });

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
    playerLocation: state.playerLocation ?? "unknown",
    isAtForgeLocation: isAtForge,
  };
}

// ============================================================
// Quest Domain Service
// ============================================================

export interface IssueQuestParams {
  title: string;
  description: string;
  sourceNpcId?: string;
  nextHint?: string;
  rewardDescription?: string;
  idempotencyKey: string;
}

export interface QuestResult {
  questId: string;
  title: string;
  description: string;
  source: string;
  reward: string;
}

/** 创建任务 */
export function createQuest(
  params: IssueQuestParams
): DmToolResult<QuestResult> {
  // 幂等检查
  const existing = checkIdempotency(params.idempotencyKey);
  if (existing) return existing as DmToolResult<QuestResult>;

  // 参数校验
  if (!params.title || params.title.length > 12) {
    return failResult("validation_error", "任务标题不能为空且不超过12字", "请提供 1-12 字的具体任务标题");
  }
  if (!params.description || params.description.length > 80) {
    return failResult("validation_error", "任务描述不能为空且不超过80字", "请提供 1-80 字的任务描述");
  }

  const questId = `quest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 构建符合 DM JSON new_tasks 格式的任务对象
  const taskObject = {
    id: questId,
    title: params.title,
    desc: params.description,
    status: "active" as const,
    source: params.sourceNpcId ?? "未知来源",
    reward: params.rewardDescription ?? "待定",
    nextHint: params.nextHint ?? "",
  };

  const result: DmToolResult<QuestResult & { taskObject: typeof taskObject }> = {
    ok: true,
    data: {
      questId,
      title: params.title,
      description: params.description,
      source: params.sourceNpcId ?? "未知来源",
      reward: params.rewardDescription ?? "待定",
      taskObject,
    },
    narrativeContext: `任务「${params.title}」已创建。${params.description}${params.nextHint ? ` 下一步：${params.nextHint}` : ""}`,
  };

  recordIdempotency(params.idempotencyKey, result);
  return result;
}

// ============================================================
// Forge Domain Service
// ============================================================

export interface ForgeWeaponParams {
  recipeId: string;
  materialIds?: string[];
  weaponId?: string;
  idempotencyKey: string;
}

export interface ForgeResultData {
  success: boolean;
  recipeName: string;
  weaponName?: string;
  modApplied?: string;
  materialsConsumed: string[];
  originiumCost: number;
  resultDescription: string;
}

/** 锻造所需的最小状态 */
export interface ForgeState {
  originium: number;
  playerLocation: string;
  inventory: Array<{ id: string; tags: string[]; tier: string; name: string }>;
}

/** 执行锻造操作 */
export function executeForge(
  params: ForgeWeaponParams,
  state: ForgeState
): DmToolResult<ForgeResultData> {
  // 幂等检查
  const existing = checkIdempotency(params.idempotencyKey);
  if (existing) return existing as DmToolResult<ForgeResultData>;

  // 查找配方
  const recipe = LIGHT_FORGE_RECIPES.find((r: LightForgeRecipe) => r.id === params.recipeId);
  if (!recipe) {
    return failResult("recipe_not_found", `未找到配方 ${params.recipeId}`, "请使用 inspect_forge_options 查看可用配方");
  }

  // 检查位置（weaponize 操作必须在 B1_PowerRoom）
  if (recipe.operation === "weaponize") {
    const locationOk = state.playerLocation === "B1_PowerRoom";
    if (!locationOk) {
      return failResult(
        "not_at_location",
        "武器化操作必须在 B1 配电间锻造台进行",
        "请前往 B1 配电间找电工老刘(N-008)"
      );
    }
  }

  // 检查原石
  const cost = recipe.costOriginium ?? 0;
  if ((state.originium ?? 0) < cost) {
    return failResult(
      "insufficient_currency",
      `原石不足：需要 ${cost}，当前拥有 ${state.originium ?? 0}`,
      `需要 ${cost - (state.originium ?? 0)} 个额外原石`
    );
  }

  // 检查材料
  const requiredTags = recipe.requiredMaterialTags ?? [];
  const missingTags = requiredTags.filter((tag: string) => {
    return !(state.inventory ?? []).some((item: any) =>
      item.tags?.includes(tag)
    );
  });
  if (missingTags.length > 0) {
    return failResult(
      "insufficient_materials",
      `材料不足：缺少标签 ${missingTags.join(", ")} 的物品`,
      `需要带有 ${missingTags.join(" 或 ")} 标签的材料`
    );
  }

  // 锻造成功 — 返回可供客户端直接应用的变更数据
  const forgedWeaponId = `WZ-${Date.now().toString(36)}`;
  const result: DmToolResult<ForgeResultData & {
    currencyCost: number;
    materialIdsToConsume: string[];
    weaponToAward: { id: string; name: string; tier: string; modKind?: string } | null;
    weaponUpdate: { operation: string; weaponId: string; modKind?: string } | null;
  }> = {
    ok: true,
    data: {
      success: true,
      recipeName: recipe.name,
      weaponName: recipe.operation === "weaponize" ? `${recipe.name}武器` : undefined,
      modApplied: recipe.weaponMod,
      materialsConsumed: requiredTags,
      originiumCost: cost,
      resultDescription: `${recipe.name}成功！消耗 ${cost} 原石。`,
      // 客户端可直接应用的变更
      currencyCost: cost,
      materialIdsToConsume: (params.materialIds ?? []),
      weaponToAward: recipe.operation === "weaponize" ? {
        id: forgedWeaponId,
        name: `${recipe.name}武器`,
        tier: recipe.weaponize?.targetTier ?? "C",
      } : null,
      weaponUpdate: recipe.weaponMod ? {
        operation: "mod",
        weaponId: params.weaponId ?? "",
        modKind: recipe.weaponMod,
      } : null,
    },
    narrativeContext: `锻造完成：${recipe.name}。消耗了 ${cost} 原石${requiredTags.length > 0 ? `和相关材料` : ""}。`,
  };

  recordIdempotency(params.idempotencyKey, result);
  return result;
}

// ============================================================
// Combat Domain Service
// ============================================================

export interface StartCombatParams {
  enemyNpcId: string;
  reason: string;
  idempotencyKey: string;
}

export interface CombatStartData {
  combatId: string;
  enemyName: string;
  enemyThreat: string;
  availableActions: string[];
}

/** 开始战斗 */
export function initiateCombat(params: StartCombatParams): DmToolResult<CombatStartData> {
  const existing = checkIdempotency(params.idempotencyKey);
  if (existing) return existing as DmToolResult<CombatStartData>;

  if (!params.enemyNpcId || !params.enemyNpcId.startsWith("N-")) {
    return failResult("invalid_target", "无效的敌人 NPC ID", "请提供有效的 NPC ID（如 N-XXX）");
  }

  const combatId = `combat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const result: DmToolResult<CombatStartData> = {
    ok: true,
    data: {
      combatId,
      enemyName: params.enemyNpcId,
      enemyThreat: "待评估",
      availableActions: ["attack", "defend", "evade", "tactical", "retreat", "item_use"],
    },
    narrativeContext: `战斗开始：与 ${params.enemyNpcId} 的冲突已触发。原因：${params.reason}`,
  };

  recordIdempotency(params.idempotencyKey, result);
  return result;
}

export interface ResolveCombatActionParams {
  actionDescription: string;
  actionType: string;
  target?: string;
  /** 目标 NPC ID（用于查找战斗画像） */
  targetNpcId?: string;
  /** 服务端游戏状态快照（用于真实规则裁决） */
  serverState?: import("./dmServerStateAdapter").ServerGameState | null;
}

export interface CombatActionResult {
  actionType: string;
  outcome: string;
  damageDealt?: number;
  damageTaken?: number;
  effects: string[];
  narrativeSnippet: string;
  /** 完整裁决结果（供叙事层使用） */
  resolution?: CombatResolution | null;
}

/** 动作类型到 CombatConflictKind 的映射 */
function mapActionToConflictKind(actionType: string): CombatConflictKind {
  switch (actionType) {
    case "attack": return "weapon_clash";
    case "defend": return "protect";
    case "evade": return "escape";
    case "tactical": return "subdue";
    case "retreat": return "escape";
    case "item_use": return "subdue";
    default: return "shove";
  }
}

/** 结算战斗动作（T11: 接入真实 combat adjudication 系统） */
export function resolvePlayerCombatAction(
  params: ResolveCombatActionParams
): DmToolResult<CombatActionResult> {
  const validActions = ["attack", "defend", "evade", "tactical", "retreat", "item_use"];
  if (!validActions.includes(params.actionType)) {
    return failResult(
      "validation_error",
      `无效的战斗动作类型：${params.actionType}`,
      `可用动作类型：${validActions.join(", ")}`
    );
  }

  if (!params.actionDescription || params.actionDescription.length > 80) {
    return failResult("validation_error", "动作描述不能为空且不超过80字", "请提供 1-80 字的动作描述");
  }

  const ss = params.serverState;
  // 如果有服务端状态和 NPC ID，使用真实 combat 系统裁决
  if (ss && params.targetNpcId && params.targetNpcId.startsWith("N-")) {
    try {
      return resolveCombatWithRealRules(params, ss);
    } catch (_e) {
      // 真实裁决失败时回退到简化规则
      console.warn("[dmAgent] combat adjudication failed, falling back to simplified rules", _e);
    }
  }

  // 简化规则 fallback（无服务端状态或无法识别的 NPC）
  const outcomes: Record<string, { outcome: string; narrative: string; damage: number }> = {
    attack: { outcome: "命中", narrative: "攻击命中目标，造成伤害", damage: 5 },
    defend: { outcome: "格挡", narrative: "成功格挡，减少伤害", damage: 0 },
    evade: { outcome: "闪避", narrative: "灵活闪避攻击", damage: 0 },
    tactical: { outcome: "战术行动", narrative: "战术动作创造优势", damage: 0 },
    retreat: { outcome: "撤退", narrative: "成功拉开距离", damage: 0 },
    item_use: { outcome: "使用物品", narrative: "使用物品获得效果", damage: 0 },
  };

  const resolved = outcomes[params.actionType] ?? outcomes.attack;

  const result: DmToolResult<CombatActionResult> = {
    ok: true,
    data: {
      actionType: params.actionType,
      outcome: resolved.outcome,
      damageDealt: resolved.damage > 0 ? resolved.damage : undefined,
      effects: [],
      narrativeSnippet: resolved.narrative,
      resolution: null,
    },
    narrativeContext: resolved.narrative,
  };

  return result;
}

/** 使用真实 combat 系统裁决战斗动作 */
function resolveCombatWithRealRules(
  params: ResolveCombatActionParams,
  ss: NonNullable<typeof params.serverState>
): DmToolResult<CombatActionResult> {
  const cs = ss.clientState;
  if (!cs) {
    return resolvePlayerCombatAction({ ...params, serverState: null });
  }

  const npcId = params.targetNpcId!;

  // 获取 NPC 隐藏战斗画像
  const npcProfile = getHiddenNpcCombatProfile({ npcId });

  // 构建场景上下文
  const floorId = extractFloorFromLocation(cs.playerLocation ?? "1F_Lobby");
  const threatPhase: MainThreatPhase =
    ((cs.activeThreatIds?.length ?? 0) > 0 ? "active" : "idle") as MainThreatPhase;

  const scene: SceneCombatContext = {
    locationId: cs.playerLocation ?? "unknown",
    floorId,
    threatPhase,
    isSafeZone: floorId === "1F" || floorId === "1",
    timeOfDay: (cs.time?.hour ?? 14) >= 18 || (cs.time?.hour ?? 14) < 6 ? "night" : "day",
    modifiers: {
      pressure: (threatPhase as string) === "breached" ? 2.0 : threatPhase === "active" ? 1.0 : 0.2,
      concealment: floorId === "B1" || floorId === "B2" ? 1.0 : 0.3,
      footing: floorId === "7" ? -0.5 : 0,
    },
    notes: [],
  };

  // 构建玩家战斗评分
  const playerStats = (cs.stats ?? {}) as Record<StatType, number>;
  const playerWeapon = cs.equippedWeapon as any;
  const playerScore = computePlayerCombatScore({
    stats: playerStats,
    equippedWeapon: playerWeapon ?? null,
    threatPhase,
    opponentVulnerableTags: npcProfile.weakTags,
  });

  // 构建 NPC 战斗评分
  const npcScore = computeNpcCombatScore({
    npc: npcProfile,
    scene,
  });

  // 映射动作类型
  const conflictKind = mapActionToConflictKind(params.actionType);

  // 裁决
  const resolution = resolveCombat({
    attacker: playerScore,
    defender: npcScore,
    scene,
    kind: conflictKind,
  });

  // 从裁决结果提取伤害评估
  const playerWon = resolution.winner === "attacker";
  const isDraw = resolution.winner === "none";
  const cost = resolution.explain.likelyCost;

  // 伤害评估（来自裁决结果的 likelyCost）
  const damageMap: Record<string, { playerDamage: number; npcDamage: number }> = {
    none: { playerDamage: 0, npcDamage: 0 },
    light: { playerDamage: 0, npcDamage: playerWon ? 5 : 1 },
    moderate: { playerDamage: isDraw ? 3 : (playerWon ? 0 : 5), npcDamage: isDraw ? 3 : (playerWon ? 5 : 0) },
    heavy: { playerDamage: playerWon ? 0 : 8, npcDamage: playerWon ? 8 : 0 },
    critical: { playerDamage: 10, npcDamage: 10 },
  };

  const damages = damageMap[cost] ?? damageMap.moderate;

  // 构建叙事片段
  const actionLabel: Record<string, string> = {
    attack: "攻击", defend: "防御", evade: "闪避",
    tactical: "战术行动", retreat: "撤退", item_use: "使用物品",
  };
  const outcomeCn: Record<string, string> = {
    crush: "碾压", overwhelm: "压倒", advantage: "占优", edge: "微优",
    stalemate: "僵持", pressured: "受压", forced_retreat: "被迫后退",
    withdraw: "脱离", collapse: "溃败", mutual_harm: "互伤",
  };

  const outcome = resolution.outcome;
  const outcomeLabel = outcomeCn[outcome] ?? outcome;
  const userActionLabel = actionLabel[params.actionType] ?? params.actionType;

  const narrativeSnippet = playerWon
    ? `${userActionLabel}取得${outcomeLabel}效果`
    : isDraw
      ? `${userActionLabel}陷入${outcomeLabel}`
      : `对方${outcomeLabel}`;

  return {
    ok: true,
    data: {
      actionType: params.actionType,
      outcome: outcomeLabel,
      damageDealt: damages.npcDamage > 0 ? damages.npcDamage : undefined,
      damageTaken: damages.playerDamage > 0 ? damages.playerDamage : undefined,
      effects: resolution.explain.why ?? [],
      narrativeSnippet,
      resolution,
    },
    narrativeContext: narrativeSnippet,
  };
}

/** 从位置字符串提取楼层 */
function extractFloorFromLocation(location: string): string {
  const match = location.match(/^[BF]?\d+/);
  return match ? match[0] : "1";
}

// ============================================================
// World Event Service
// ============================================================

export interface ApplyWorldEventParams {
  eventType: string;
  eventData?: Record<string, unknown>;
  idempotencyKey: string;
}

export interface WorldEventResult {
  eventType: string;
  applied: boolean;
  description: string;
}

/** 应用世界事件 */
export function applyWorldEvent(params: ApplyWorldEventParams): DmToolResult<WorldEventResult> {
  const existing = checkIdempotency(params.idempotencyKey);
  if (existing) return existing as DmToolResult<WorldEventResult>;

  const validTypes = ["npc_move", "location_change", "threat_change", "time_advance", "reveal_unlock"];
  if (!validTypes.includes(params.eventType)) {
    return failResult("validation_error", `无效的事件类型：${params.eventType}`, `可用类型：${validTypes.join(", ")}`);
  }

  const descriptions: Record<string, string> = {
    npc_move: "NPC 已移动",
    location_change: "位置已变更",
    threat_change: "危险等级已更新",
    time_advance: "时间已推进",
    reveal_unlock: "揭露层级已解锁",
  };

  const result: DmToolResult<WorldEventResult> = {
    ok: true,
    data: {
      eventType: params.eventType,
      applied: true,
      description: descriptions[params.eventType] ?? "事件已应用",
    },
    narrativeContext: `世界事件已应用：${descriptions[params.eventType] ?? params.eventType}`,
  };

  recordIdempotency(params.idempotencyKey, result);
  return result;
}

// ============================================================
// Helpers
// ============================================================

function failResult<T = unknown>(
  code: DmToolErrorCode,
  error: string,
  recoveryHint?: string
): DmToolResult<T> {
  return {
    ok: false,
    error,
    code,
    narrativeContext: `操作失败：${error}${recoveryHint ? `。建议：${recoveryHint}` : ""}`,
    recoveryHint,
  };
}
