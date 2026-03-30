/**
 * NPC 认知隔离：上线灰度 / 回滚用统一开关（兼容旧 env 名）。
 */

import { envBoolean, envRaw } from "@/lib/config/envRaw";
import {
  getNpcNarrativeRolloutFlagsSnapshot,
  type NpcNarrativeRolloutFlagsSnapshot,
} from "@/lib/playRealtime/npcNarrativeRolloutFlags";
import { getDefaultMemoryPolicyForNpc, isXinlanNpcId } from "./policy";
import type { NpcEpistemicProfile } from "./types";

export type EpistemicRolloutFlagsSnapshot = {
  enableEpistemicGuard: boolean;
  enableEpistemicValidator: boolean;
  /** 叙事层 NPC 一致性校验（阶段 6）；可与认知事实校验独立灰度 */
  enableNpcConsistencyValidator: boolean;
  /** 注入 actor_canon_packet 等注册表硬约束 */
  enableNpcCanonGuard: boolean;
  /** npc_player_baseline_packet（误闯学生基线等） */
  enableNpcBaselineAttitude: boolean;
  /** npc_scene_authority_packet（在场/离屏门闸） */
  enableNpcSceneAuthority: boolean;
  /** actor 分层记忆裁剪块 */
  enableActorScopedEpistemic: boolean;
  enableNpcResidue: boolean;
  /** 欣蓝高权限（新名）；未设时回退 STRONG_MEMORY */
  enableXinlanHighPrivilege: boolean;
  /** 兼容旧 telemetry / 文档 */
  enableXinlanStrongMemory: boolean;
  /** 兼容旧名 */
  epistemicDebugLog: boolean;
  /** VERSECRAFT_NPC_DEBUG；未设时回退 EPISTEMIC_DEBUG_LOG */
  npcDebug: boolean;
} & NpcNarrativeRolloutFlagsSnapshot;

/** 每请求快照一次即可，避免多次读 env */
export function getEpistemicRolloutFlags(): EpistemicRolloutFlagsSnapshot {
  const xinlan = readXinlanHighPrivilege();
  return {
    enableEpistemicGuard: envBoolean("VERSECRAFT_ENABLE_EPISTEMIC_GUARD", true),
    enableEpistemicValidator: readValidatorEnabled(),
    enableNpcConsistencyValidator: readNpcConsistencyValidatorEnabled(),
    enableNpcCanonGuard: envBoolean("VERSECRAFT_ENABLE_NPC_CANON_GUARD", true),
    enableNpcBaselineAttitude: envBoolean("VERSECRAFT_ENABLE_NPC_BASELINE_ATTITUDE", true),
    enableNpcSceneAuthority: envBoolean("VERSECRAFT_ENABLE_NPC_SCENE_AUTHORITY", true),
    enableActorScopedEpistemic: envBoolean("VERSECRAFT_ENABLE_ACTOR_SCOPED_EPISTEMIC", true),
    enableNpcResidue: readNpcResidueEnabled(),
    enableXinlanHighPrivilege: xinlan,
    enableXinlanStrongMemory: xinlan,
    epistemicDebugLog: readNpcDebugEnabled(),
    npcDebug: readNpcDebugEnabled(),
    ...getNpcNarrativeRolloutFlagsSnapshot(),
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

/**
 * 显式设置 VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR 时可与 EPISTEMIC_VALIDATOR 解耦；
 * 未设置时跟随认知校验开关（兼容旧 POST_GUARD 一键全关）。
 */
function readNpcConsistencyValidatorEnabled(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR", true);
  }
  return readValidatorEnabled();
}

export function enableNpcConsistencyValidator(): boolean {
  return readNpcConsistencyValidatorEnabled();
}

/**
 * 阶段7：叙事节奏/人格/校源/任务层后置校验；未单独设置时跟随 NPC 一致性校验。
 */
function readNarrativeRhythmValidatorEnabled(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_NARRATIVE_RHYTHM_VALIDATOR") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_NARRATIVE_RHYTHM_VALIDATOR", true);
  }
  return readNpcConsistencyValidatorEnabled();
}

export function enableNarrativeRhythmValidator(): boolean {
  return readNarrativeRhythmValidatorEnabled();
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

/** 新名优先；未设置时回退 VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY */
export function enableXinlanHighPrivilege(): boolean {
  return readXinlanHighPrivilege();
}

function readXinlanHighPrivilege(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_XINLAN_HIGH_PRIVILEGE") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_XINLAN_HIGH_PRIVILEGE", true);
  }
  return envBoolean("VERSECRAFT_ENABLE_XINLAN_STRONG_MEMORY", true);
}

export function enableXinlanStrongMemory(): boolean {
  return readXinlanHighPrivilege();
}

function readNpcDebugEnabled(): boolean {
  if (envRaw("VERSECRAFT_NPC_DEBUG") !== undefined) {
    return envBoolean("VERSECRAFT_NPC_DEBUG", false);
  }
  return envBoolean("VERSECRAFT_EPISTEMIC_DEBUG_LOG", false);
}

export function epistemicDebugLog(message: string, data?: Record<string, unknown>): void {
  if (!readNpcDebugEnabled()) return;
  if (data && Object.keys(data).length > 0) {
    console.info(`[epistemic] ${message}`, data);
  } else {
    console.info(`[epistemic] ${message}`);
  }
}

/**
 * 关闭「欣蓝高权限」时：将其降级为普通 NPC 策略（用于灰度回滚），validator 亦不再套用 world 例外。
 */
export function applyEpistemicRolloutToProfile(profile: NpcEpistemicProfile): NpcEpistemicProfile {
  if (readXinlanHighPrivilege()) return profile;
  if (!isXinlanNpcId(profile.npcId)) return profile;
  const d = getDefaultMemoryPolicyForNpc("N-001");
  return {
    ...profile,
    ...d,
    npcId: profile.npcId.trim(),
    isXinlanException: false,
  };
}
