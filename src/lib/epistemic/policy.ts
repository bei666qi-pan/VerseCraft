/**
 * 认知策略默认值与欣蓝（N-010）硬编码例外。
 * 其他 NPC 默认策略必须保守，避免「全员记得主角」。
 */

import type { NpcEpistemicProfile, NpcMemoryPolicy } from "./types";

/** 欣蓝：显式常量，供守卫与 builder 分支（禁止仅靠文档字符串） */
export const XINLAN_NPC_ID = "N-010";

const DEFAULT_NPC_MEMORY: NpcMemoryPolicy = {
  remembersPlayerIdentity: "none",
  remembersPastLoops: false,
  retainsEmotionalResidue: true,
  canRecognizeForbiddenKnowledge: false,
  surpriseThreshold: 0.45,
  suspicionBias: 0,
};

const XINLAN_MEMORY: NpcMemoryPolicy = {
  remembersPlayerIdentity: "exact",
  remembersPastLoops: true,
  retainsEmotionalResidue: true,
  canRecognizeForbiddenKnowledge: true,
  surpriseThreshold: 0.72,
  suspicionBias: 0.15,
};

export function isXinlanNpcId(npcId: string): boolean {
  return String(npcId ?? "").trim() === XINLAN_NPC_ID;
}

/**
 * 返回该 NPC 的默认认知配置（含欣蓝例外）。
 * 后续可从 registry / 存档覆盖，阶段 1 以静态策略为主。
 */
export function getDefaultMemoryPolicyForNpc(npcId: string): NpcMemoryPolicy {
  if (isXinlanNpcId(npcId)) {
    return { ...XINLAN_MEMORY };
  }
  return { ...DEFAULT_NPC_MEMORY };
}

export function buildNpcEpistemicProfileFromPolicy(npcId: string, overrides?: Partial<NpcMemoryPolicy>): NpcEpistemicProfile {
  const base = getDefaultMemoryPolicyForNpc(npcId);
  const merged = { ...base, ...overrides };
  return {
    npcId: String(npcId).trim(),
    isXinlanException: isXinlanNpcId(npcId),
    ...merged,
  };
}
