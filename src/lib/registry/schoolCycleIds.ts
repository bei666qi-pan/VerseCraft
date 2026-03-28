/**
 * 七锚中的六名共鸣位（辅锚）— 与 `npcProfiles.ts` CORE_NPC_PROFILES_V2 id 对齐。
 * 主锚为玩家回声体，不占用 NPC id。
 */
export const SCHOOL_CYCLE_RESONANCE_NPC_IDS = [
  "N-015",
  "N-020",
  "N-010",
  "N-018",
  "N-013",
  "N-007",
] as const;

export type SchoolCycleResonanceNpcId = (typeof SCHOOL_CYCLE_RESONANCE_NPC_IDS)[number];
