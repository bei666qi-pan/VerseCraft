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

export interface Item {
  id: string;
  name: string;
  tier: ItemTier;
  description: string;
  statBonus?: Partial<Record<StatType, number>>;
  tags: string;
  /** Blocks one lethal attack (e.g. from B2守门人) when used correctly */
  blockLethal?: boolean;
  /** Rule-based kill: can ignore combatPower gap to kill anomaly/NPC */
  ruleKill?: boolean;
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
