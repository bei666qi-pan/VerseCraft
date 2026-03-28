// src/lib/registry/types.ts
// 如月公寓规则怪谈实体注册表 - 基础类型定义

export type StatType =
  | "sanity"
  | "agility"
  | "luck"
  | "charm"
  | "background";

export type ItemTier = "S" | "A" | "B" | "C" | "D";

/**
 * 可武器化品级（核心设定：武器来自“高级道具武器化”，因此只有 C 及以上能作为原料）。
 * - 兼容策略：不改变 `ItemTier`，只新增一个“可武器化”子集类型。
 */
export type WeaponTier = Exclude<ItemTier, "D">; // "S" | "A" | "B" | "C"

/** Floor IDs: B2=exit, B1=spawn, 1-7=above ground */
export type FloorId = "B2" | "B1" | "1" | "2" | "3" | "4" | "5" | "6" | "7";

/**
 * 叙事/玩法分层（可选）：用于手记同步与 DM 发奖路由；旧道具无此字段则按 effectType/forgeTags 推断。
 */
export type ItemDomainLayer =
  | "key"
  | "tool"
  | "consumable"
  | "evidence"
  | "social_token"
  | "material";

/** Item effect types — direct, observable effects (not clue-based) */
export type ItemEffectType =
  | "shield"        // Blocks one lethal attack
  | "ruleKill"     // Rule-based kill, ignores combatPower gap
  | "tempStat"     // Temporarily boost a stat (e.g. +5 agility for 1h)
  | "intel"        // Reveal intel / clue packets
  | "access"       // Open route / pass checks
  | "disguise"     // Temporary identity disguise
  | "amnesty"      // Temporary hostility waiver / checkpoint pass
  | "trigger"      // Trigger hidden window / event seed
  | "tempFavor"    // Legacy: no longer recommended
  | "transform"    // Transform into specific NPC appearance
  | "purify"       // Purify pollution / drive away low-tier anomaly
  | "key"          // Open doors / bypass locks
  | "bait"         // Divert anomaly attention
  | "binding"      // Bind/trap small entity briefly
  | "consumable";  // One-time consumable (heal/stat restore)

/** Stat requirement per tier: D≥3, C 5-10, B 10-15, A 20, S all≥20. Parchment has none. */
export type StatRequirement = Partial<Record<StatType, number>>;

export interface Item {
  id: string;
  name: string;
  tier: ItemTier;
  description: string;
  statBonus?: Partial<Record<StatType, number>>;
  tags: string;
  /** Usage requirement: player must meet these stats. Omit = no check (parchment only). */
  statRequirements?: StatRequirement;
  /** Owner NPC or Anomaly ID. All items have an owner; dropped items belong to the entity that dropped them. */
  ownerId: string;
  /** Primary effect type for DM/UI display */
  effectType?: ItemEffectType;
  /** Short one-line effect for quick scan; falls back to derived from effectType if absent */
  effectSummary?: string;
  /** Blocks one lethal attack (legacy, maps to effectType shield) */
  blockLethal?: boolean;
  /** Rule-based kill (legacy, maps to effectType ruleKill) */
  ruleKill?: boolean;
  /** For transform: target NPC id to impersonate */
  transformTargetId?: string;
  /** For tempStat: stat and value */
  tempStatEffect?: { stat: StatType; value: number };
  /** For tempFavor: base favor gain */
  tempFavorEffect?: number;
  /** Stage-2 light forge: optional material tags reused by forge recipes. */
  forgeTags?: string[];
  /** Stage-2 light forge: generic material value (default 1). */
  materialValue?: number;
  /** Stage-2 light forge: recommended operations for this material. */
  compatibleOperations?: ForgeOperation[];

  /**
   * 武器化声明（可选字段，兼容旧存档/旧表）
   *
   * 设计目的：
   * - 让“普通道具”与“可武器化道具”在数据层可区分，而不强迫马上改动所有道具表。
   * - 规则默认：tier 为 C/B/A/S 的道具“理论上可武器化”；若某个道具应被禁止（叙事关键物/破坏平衡），可显式标记为不可。
   *
   * 注意：
   * - 本字段只是“资格声明”，真正的裁决（数量、费用、折扣、地点=锻造台）应由服务端权威链路执行。
   */
  weaponization?: {
    /** 默认 undefined 视为：按 tier 推断；true/false 可强制覆盖 */
    eligible?: boolean;
    /** 可选：用于 UI/DM 的拒绝原因（例如“剧情关键物不可拆解”） */
    reason?: string;
  };
  /** 可选：领域分层（阶段 2 起 DM/注册表可写） */
  domainLayer?: ItemDomainLayer;
}

/**
 * 可武器化道具：C/B/A/S（高级道具）。
 * - 兼容策略：这是“类型层区分”，不要求运行时一定带 `weaponization` 字段。
 */
export type WeaponizableItem = Item & { tier: WeaponTier };

export interface NPC {
  id: string;
  name: string;
  location: string;
  /** Initial/refresh floor; use "random" for random floor spawn per run */
  floor: FloorId | "random";
  /** Personality: 暴躁/温和/贪婪/怯懦 etc. Affects interaction and aggression. */
  personality: string;
  /** Specialty: 后勤补给/战斗辅助/情报提供 etc. */
  specialty: string;
  /** Combat power 3-10. High-power NPCs (9-10) can fight A-008 if favorability极高. */
  combatPower: number;
  appearance: string;
  taboo: string;
  defaultFavorability: number;
  lore: string;
}

export interface NpcDisplayLayer {
  name: string;
  appearance: string;
  floor: FloorId | "random";
  publicPersonality: string;
  specialty: string;
  combatPower: number;
  combatPowerDisplay?: string;
}

export interface NpcInteractionLayer {
  speechPattern: string;
  taboo: string;
  relationshipHooks: string[];
  questHooks: string[];
  surfaceSecrets: string[];
}

export interface NpcDeepSecretLayer {
  trueMotives: string[];
  trueCombatPower?: number;
  dragonWorldLink?: string;
  conspiracyRole?: string;
  /** 学制循环：公寓侧运行态归类（如校源徘徊者），与出身叙事区分 */
  schoolCycleTag?: string;
  revealConditions: string[];
}

export interface NpcProfileV2 {
  id: string;
  homeNode: string;
  display: NpcDisplayLayer;
  interaction: NpcInteractionLayer;
  deepSecret: NpcDeepSecretLayer;
}

export interface NpcRelationStateV2 {
  favorability: number;
  trust: number;
  fear: number;
  debt: number;
  affection: number;
  desire: number;
  romanceEligible: boolean;
  romanceStage: "none" | "hint" | "bonded" | "committed";
  betrayalFlags: string[];
}

/** Immutable emotion/relationship thread — e.g. "secretly in love with X" or "blood feud with Y" */
export type ImmutableRelationship = string;

export interface NpcSocialProfile {
  homeLocation: string;
  weakness: string;
  scheduleBehavior: string;
  relationships: Record<string, string>;
  /** Absolute canon background — DM MUST never fabricate, modify or forget. */
  fixed_lore: string;
  /** Core desires that drive the NPC's behavior. */
  core_desires: string;
  /** Optional: core fear (phase-3 NPC heart). */
  core_fear?: string;
  /** Optional: rupture threshold hints (phase-3). */
  rupture_threshold?: { trustBelow?: number; fearAbove?: number; debtAbove?: number };
  /** Optional: task issuing style hint (phase-3). */
  task_style?: "direct" | "transactional" | "manipulative" | "avoidant" | "protective";
  /** Optional: truthfulness band (phase-3). */
  truthfulness_band?: "low" | "medium" | "high";
  /** Optional: emotional debt collection pattern (phase-3). */
  emotional_debt_pattern?: string;
  /** Immutable emotion threads — cannot be retconned. */
  immutable_relationships: ImmutableRelationship[];
  /** Emotional traits, quirks, habits — makes NPC feel like a real person. DM MUST weave into dialogue. */
  emotional_traits?: string;
  /** Speech patterns, catchphrases, tone — e.g. "爱用歇后语；对熟人会骂骂咧咧实则关心" */
  speech_patterns?: string;
  /** B1 only: in-character script for guiding new tenants about Settings/Tasks/Backpack/ManualInput. Never break 4th wall. */
  new_tenant_guidance_script?: string;
}

/** 物品：存放于仓库，无属性要求，无等级。收益略大于副作用。楼层越高越强。 */
export interface WarehouseItem {
  id: string;
  name: string;
  description: string;
  /** Benefit description (正向作用) */
  benefit: string;
  /** Side effect description (副作用). Always present, slightly weaker than benefit. */
  sideEffect: string;
  /** Owner NPC or Anomaly ID */
  ownerId: string;
  /** Floor of origin — higher floor = stronger item */
  floor: FloorId;
  /** Resurrection item: revives any NPC/anomaly except player. SideEffect: 1天内玩家遭遇生命威胁试炼 */
  isResurrection?: boolean;
  /** Stage-2 light forge: optional material tags reused by forge recipes. */
  forgeTags?: string[];
  /** Stage-2 light forge: generic material value (default 1). */
  materialValue?: number;
  /** Stage-2 light forge: recommended operations for this material. */
  compatibleOperations?: ForgeOperation[];
}

/**
 * 锻造操作类型：
 * - repair/mod/infuse：现有“轻锻造”能力（必须保持兼容）
 * - weaponize：新增“高级道具→武器化”能力（只能在锻造台，且必须权威裁决消耗/费用/折扣）
 */
export type ForgeOperation = "repair" | "mod" | "infuse" | "weaponize";
export type ForgeMaterialTag =
  | "conductive"
  | "mirror"
  | "insulation"
  | "sealant"
  | "sound"
  | "fiber"
  | "pollution";

export type WeaponModSlot = "core" | "surface";

export type WeaponModKind =
  | "silent"
  | "mirror"
  | "conductive"
  | "anti_pollution"
  | "grappling"
  | "echo_lure";

export interface InfusionState {
  threatTag: "liquid" | "mirror" | "cognition" | "seal";
  turnsLeft: number;
}

export interface ForgeRecipe {
  id: string;
  operation: ForgeOperation;
  name: string;
  description: string;
  costOriginium: number;
  requiredItemIds?: string[];
  requiredWarehouseIds?: string[];
  requiredMaterialTags?: ForgeMaterialTag[];
}

export interface ForgeResult {
  ok: boolean;
  operation: ForgeOperation;
  narrative: string;
  consumedItemIds: string[];
  consumedWarehouseIds: string[];
  currencyChange: number;
  weaponUpdates: Array<{
    /**
     * 兼容字段：旧链路用 weaponId 从固定表取武器。
     * 新链路（weaponize）允许直接回写完整 weapon 对象（用于“武器继承原道具效果/门槛/来源”）。
     * - 注意：前端消费点若尚未支持 `weapon`，服务端应回退到 weaponId 模板绑定模式。
     */
    weaponId?: string;
    weapon?: Weapon;
    /** 装备系统：明确卸下（清空武器栏）。 */
    unequip?: boolean;
    stability?: number;
    calibratedThreatId?: string | null;
    currentMods?: WeaponModKind[];
    currentInfusions?: InfusionState[];
    contamination?: number;
    repairable?: boolean;
  }>;
}

export interface Weapon {
  id: string;
  name: string;
  description: string;
  /** Threat IDs this weapon is good at countering (e.g. A-002). */
  counterThreatIds: string[];
  /** Lightweight tags for packet/prompt hints. */
  counterTags: string[];
  /** Stage-2 minimal stability value (0-100). */
  stability: number;
  /** Optional calibration target from light forge system. */
  calibratedThreatId?: string | null;
  /** Light forge structure: available slots and currently installed mods. */
  modSlots: WeaponModSlot[];
  currentMods: WeaponModKind[];
  /** Short-lived infusions that boost specific threat tag response. */
  currentInfusions: InfusionState[];
  /** 0-100 contamination load; high values reduce reliability until repaired. */
  contamination: number;
  /** Whether this weapon can be repaired/maintained now. */
  repairable: boolean;

  // ---------------------------
  // Stage-3: “道具→武器化”扩展字段（全部可选，确保不破坏现有消费点）
  // ---------------------------

  /**
   * 武器品级/阶级。
   *
   * 设计原因：
   * - 武器不是独立掉落体系，而是由 C+ 高级道具武器化而来，因此武器必然有一个对应的品级。
   * - 旧系统里的 `WEAPONS` 固定表可视作“兼容层/模板”，也需要被赋予 tier 语义以便迁移。
   */
  tier?: WeaponTier;

  /**
   * 装备位语义（单武器栏）。
   *
   * 设计原因：
   * - “单武器栏”强制玩家做取舍，避免多装备叠加导致叙事行动无限泛化，也便于反作弊与裁决闭环。
   * - 兼容策略：现有存档字段 `equippedWeapon?: Weapon | null` 继续可用；未来可将“武器栏状态”从 `Weapon` 里剥离到权威状态，但这里先提供语义锚点。
   */
  equipSlot?: "weapon_main";

  /**
   * 换装耗时规则（以“回合/行动轮次”为单位）。
   *
   * 设计原因：
   * - 若换装不耗时，玩家可在同一回合通过换装来规避风险/刷收益，削弱决策张力并显著提高作弊空间。
   * - 兼容策略：不强制所有武器具备；默认逻辑可在规则层用缺省=1。
   */
  equipTimeCostTurns?: number; // 默认建议=1

  /**
   * 效果来源映射：武器继承原道具的“主要效果与使用门槛”，但改为可反复使用（不再消耗）。
   *
   * 设计原因：
   * - 让“武器=高级道具武器化”在数据上可追溯、可解释（UI/DM 均可读）。
   * - 同时保持旧字段不变：旧系统仍可继续只看 counterTags / stability 等字段。
   */
  effectSource?: {
    /** 原始道具的 effectType（若存在） */
    effectType?: ItemEffectType;
    /** 原始道具的 effectSummary（若存在） */
    effectSummary?: string;
    /** 原始道具的 statRequirements（若存在） */
    statRequirements?: StatRequirement;
    /**
     * 原始道具“主要效果”的归因描述（可选，供叙事与 UI 展示）
     * 例：shield/ruleKill/transform 等效果在武器化后表现为“可重复触发的装备能力”。
     */
    primaryEffectNote?: string;
  };

  /**
   * 来源追踪：由哪些道具武器化而来，以及在何处/以何种折扣生成。
   *
   * 设计原因：
   * - 反作弊：能够追溯“这把武器为什么存在、是否满足配方与费用”。
   * - 玩法：允许后续设计“某些 NPC 只承认在他们见证下锻造的武器”之类的叙事/系统钩子。
   *
   * 兼容策略：
   - 老的固定武器表（`WEAPONS`）没有来源，默认可视作 `kind=legacy_catalog`。
   */
  provenance?: WeaponProvenance;
}

/**
 * 武器生成/流转追踪信息（只定义结构；裁决由服务端权威链路写入）。
 */
export type WeaponProvenance =
  | {
      /**
       * 由“高级道具→武器化”生成。
       *
       * 命名约定：
       * - `weaponize`：当前规范字段（对齐 forge operation 名称，便于全链路搜索与审计）。
       * - `weaponized_item`：历史兼容别名（早期实现遗留）。读取时应视作等价。
       */
      kind: "weaponize" | "weaponized_item";
      /** 本次武器化消耗的道具 ID 列表（C:3 / B:2 / A:1 / S:1） */
      sourceItemIds: string[];
      /** 本次武器化配方目标阶级 */
      targetTier: WeaponTier;
      /** 生成发生的服务节点（必须是锻造台所在节点；兼容：可空） */
      forgedAtNodeId?: ServiceNodeId;
      /** 对应锻造服务定义 ID（兼容：可空） */
      forgedByServiceId?: string;
      /** 支付信息（用于折扣追溯/审计） */
      payment?: {
        baseCostOriginium: number;
        finalCostOriginium: number;
        discountApplied: boolean;
        discountReasonCodes?: string[];
        discountSource?: WeaponizationDiscountSource;
      };
    }
  | {
      kind: "legacy_catalog";
      /** 兼容层标注：来自旧的固定武器表。 */
      legacyTag?: string;
    };

/**
 * 折扣来源（只描述“来源类型与可追踪条件”，不在类型层实现判定）。
 */
export type WeaponizationDiscountSource =
  | {
      kind: "npc_relationship";
      npcId: string;
      /** 例如：好感阈值、盟友关系标记等 */
      requiredRelation?: { favorabilityGte?: number; ally?: boolean };
    }
  | {
      kind: "service_unlock";
      serviceId: string;
    }
  | {
      kind: "composite";
      allOf: WeaponizationDiscountSource[];
    };

/**
 * “道具→武器化”配方结构（数据模型）。
 *
 * 设计目标：
 * - 明确：目标阶级、数量、费用、是否允许折扣与折扣条件。
 * - 兼容：不要求立刻改动旧 forge 系统；可作为新一代锻造台/服务裁决的注册表输入。
 */
export interface WeaponizationRecipe {
  id: string;
  /** 目标武器阶级（也是目标武器的 tier） */
  targetTier: WeaponTier;
  /** 所需道具数量（C=3, B=2, A=1, S=1） */
  requiredItemCount: number;
  /** 所需道具最低品级（核心设定：必须 C 及以上） */
  requiredMinItemTier: WeaponTier;
  /** 基础原石费用（C=5, B=10, A=20, S=50） */
  baseCostOriginium: number;
  /** 是否允许折扣（默认允许；某些配方可关掉以保护节奏） */
  discountAllowed: boolean;
  /** 折扣来源条件（满足任一/全部由执行器解释；这里仅表达“可追踪”） */
  discountSources?: WeaponizationDiscountSource[];
  /**
   * 武器生成策略（不在 types.ts 写具体算法；只定义策略枚举/参数）。
   * - inherit_primary: 继承原道具的主效果与门槛；counterTags/反制标签由道具 tags/forgeTags 推导。
   * - template_bind: 绑定到某个基础武器模板（例如“镜背匕”类），但仍记录 provenance。
   */
  generationStrategy:
    | { kind: "inherit_primary"; allowMixedSources: boolean }
    | { kind: "template_bind"; templateId: string };
  /** 是否允许重复锻造成同类武器（影响“刷同款”与审计策略） */
  canRepeatForge: boolean;
}

/** Player cannot fight anomalies or NPCs unarmed. Must use items or high-favorability NPCs. */
export interface Anomaly {
  id: string;
  name: string;
  /** Floor: A-001~A-007 on 1-7; A-008 on B2 only */
  floor: FloorId;
  /** Combat power 3-10. A-008 must be 10. */
  combatPower: number;
  appearance: string;
  killingRule: string;
  survivalMethod: string;
  sanityDamage: number;
}

export type ServiceNodeId =
  | "B1_SafeZone"
  | "B1_Storage"
  | "B1_Laundry"
  | "B1_PowerRoom";

export type ServiceKind =
  | "revive_anchor"
  | "safe_restore"
  | "gatekeeper_meeting"
  | "shop_trade"
  | "salary_settlement"
  | "forge_upgrade"
  | "forge_repair"
  | "cleanse"
  | "rumor"
  | "soft_guidance";

export interface ServiceDefinition {
  id: string;
  kind: ServiceKind;
  name: string;
  description: string;
  npcIds: string[];
  enabledByDefault: boolean;
}

export interface ServiceNodeDefinition {
  nodeId: ServiceNodeId;
  label: string;
  isAbsoluteSafeZone: boolean;
  services: ServiceDefinition[];
}

// Stage-1 snapshot base (re-export for legacy import compatibility).
export type { RunSnapshotV2 } from "@/lib/state/snapshot/types";
