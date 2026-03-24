// src/lib/registry/types.ts
// 如月公寓规则怪谈实体注册表 - 基础类型定义

export type StatType =
  | "sanity"
  | "agility"
  | "luck"
  | "charm"
  | "background";

export type ItemTier = "S" | "A" | "B" | "C" | "D";

/** Floor IDs: B2=exit, B1=spawn, 1-7=above ground */
export type FloorId = "B2" | "B1" | "1" | "2" | "3" | "4" | "5" | "6" | "7";

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
}

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

export type ForgeOperation = "repair" | "mod" | "infuse";
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
    weaponId: string;
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
