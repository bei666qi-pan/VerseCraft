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
}

export interface NPC {
  id: string;
  name: string;
  location: string;
  /** Initial floor; DM may place NPC on random floor each run */
  floor: FloorId;
  /** Personality/temperament, e.g. 暴躁/温和/贪婪. Affects interaction and aggression. */
  personality: string;
  appearance: string;
  taboo: string; // 绝对禁忌（触发好感度暴跌或攻击的条件）
  defaultFavorability: number;
  lore: string; // 背景故事
}

/** Player cannot fight anomalies or NPCs unarmed. Must use items or high favorability. */
export interface Anomaly {
  id: string;
  name: string;
  /** Floor this anomaly is fixed to. A-001~A-007: floors 1-7; A-008: B2 only */
  floor: FloorId;
  appearance: string;
  killingRule: string; // 必杀规则
  survivalMethod: string; // 破局条件描述（后续会被大模型提取解析）
  sanityDamage: number;
}
