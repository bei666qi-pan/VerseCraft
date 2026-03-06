// src/lib/registry/types.ts
// 如月公寓规则怪谈实体注册表 - 基础类型定义

export type StatType =
  | "sanity"
  | "agility"
  | "luck"
  | "charm"
  | "background";

export type ItemTier = "S" | "A" | "B" | "C" | "D";

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
  appearance: string;
  taboo: string; // 绝对禁忌（触发好感度暴跌或攻击的条件）
  defaultFavorability: number;
  lore: string; // 背景故事
}

export interface Anomaly {
  id: string;
  name: string;
  appearance: string;
  killingRule: string; // 必杀规则
  survivalMethod: string; // 破局条件描述（后续会被大模型提取解析）
  sanityDamage: number;
}
