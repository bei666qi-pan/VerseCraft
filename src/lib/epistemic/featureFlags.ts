/**
 * NPC 认知隔离：上线灰度 / 回滚用统一开关（兼容旧 env 名）。
 */

import { envBoolean, envRaw } from "@/lib/config/envRaw";
import { getDefaultMemoryPolicyForNpc, isXinlanNpcId } from "./policy";
import type { NpcEpistemicProfile } from "./types";

export type EpistemicRolloutFlagsSnapshot = {
  enableEpistemicGuard: boolean;
  enableEpistemicValidator: boolean;
  enableNpcResidue: boolean;
  enableXinlanStrongMemory: boolean;
  epistemicDebugLog: boolean;
};

/** 每请求快照一次即可，避免多次读 env */
export function getEpistemicRolloutFlags(): EpistemicRolloutFlagsSnapshot {
  return {
    enableEpistemicGuard: envBoolean("VERSECRAFT_ENABLE_EPISTEMIC_GUARD", true),
    enableEpistemicValidator: readValidatorEnabled(),
    enableNpcResidue: readNpcResidueEnabled(),
    enableXinlanStrongMemory: envBoolean("VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY", true),
    epistemicDebugLog: envBoolean("VERSECRAFT_EPISTEMIC_DEBUG_LOG", false),
  };
}

export function enableEpistemicGuard(): boolean {
  return envBoolean("VERSECRAFT_ENABLE_EPISTEMIC_GUARD", true);
}

/** 新名优先；未设置时回退 VERSECRAFT_EPISTEMIC_POST_GUARD */
export function enableEpistemicValidator(): boolean {
  return readValidatorEnabled();
}

function readValidatorEnabled(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR", true);
  }
  return envBoolean("VERSECRAFT_EPISTEMIC_POST_GUARD", true);
}

/** 新名优先；未设置时回退 VERSECRAFT_EPISTEMIC_RESIDUE_GAMEFEEL */
export function enableNpcResidue(): boolean {
  return readNpcResidueEnabled();
}

function readNpcResidueEnabled(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_NPC_RESIDUE") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_NPC_RESIDUE", true);
  }
  return envBoolean("VERSECRAFT_EPISTEMIC_RESIDUE_GAMEFEEL", true);
}

export function enableXinlanStrongMemory(): boolean {
  return envBoolean("VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY", true);
}

export function epistemicDebugLog(message: string, data?: Record<string, unknown>): void {
  if (!envBoolean("VERSECRAFT_EPISTEMIC_DEBUG_LOG", false)) return;
  if (data && Object.keys(data).length > 0) {
    console.info(`[epistemic] ${message}`, data);
  } else {
    console.info(`[epistemic] ${message}`);
  }
}

/**
 * 关闭「欣蓝强记忆」时：将其降级为普通 NPC 策略（用于灰度回滚），validator 亦不再套用 world 例外。
 */
export function applyEpistemicRolloutToProfile(profile: NpcEpistemicProfile): NpcEpistemicProfile {
  if (enableXinlanStrongMemory()) return profile;
  if (!isXinlanNpcId(profile.npcId)) return profile;
  const d = getDefaultMemoryPolicyForNpc("N-001");
  return {
    ...profile,
    ...d,
    npcId: profile.npcId.trim(),
    isXinlanException: false,
  };
}
