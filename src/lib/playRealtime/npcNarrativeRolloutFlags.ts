/**
 * 阶段8：NPC 人格 / 校源伏笔 / 任务层 / 细粒度时间 / 子校验器 — 独立灰度开关。
 * 未设置子开关时：跟随 VERSECRAFT_ENABLE_NARRATIVE_RHYTHM_VALIDATOR → NPC_CONSISTENCY → EPISTEMIC_VALIDATOR。
 */

import { envBoolean, envRaw } from "@/lib/config/envRaw";

function readValidatorEnabled(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR", true);
  }
  return envBoolean("VERSECRAFT_EPISTEMIC_POST_GUARD", true);
}

function readNpcConsistencyValidatorEnabled(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR", true);
  }
  return readValidatorEnabled();
}

/** 与 featureFlags.enableNarrativeRhythmValidator 同源逻辑 */
function readNarrativeRhythmParent(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_NARRATIVE_RHYTHM_VALIDATOR") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_NARRATIVE_RHYTHM_VALIDATOR", true);
  }
  return readNpcConsistencyValidatorEnabled();
}

/** 人格锚 packet 丰富字段（actor_personality / residue 等） */
export function enableNpcPersonalityCoreV2(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_NPC_PERSONALITY_CORE_V2") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_NPC_PERSONALITY_CORE_V2", true);
  }
  return readNarrativeRhythmParent();
}

/** actor_foreshadow_packet 与校源阶梯 hint */
export function enableMajorNpcForeshadow(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_MAJOR_NPC_FORESHADOW") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_MAJOR_NPC_FORESHADOW", true);
  }
  return readNarrativeRhythmParent();
}

/** playerContext 【rt_task_layers】+ narrative_task_mode_packet */
export function enableTaskModeLayer(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_TASK_MODE_LAYER") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_TASK_MODE_LAYER", true);
  }
  return readNarrativeRhythmParent();
}

/** 用户输入启发式 time_cost 档位（light/heavy/dangerous 等） */
export function enableFineGrainTimeCost(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_FINE_GRAIN_TIME_COST") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_FINE_GRAIN_TIME_COST", true);
  }
  return readNarrativeRhythmParent();
}

export function enablePersonalityValidator(): boolean {
  if (!readNarrativeRhythmParent()) return false;
  if (envRaw("VERSECRAFT_ENABLE_PERSONALITY_VALIDATOR") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_PERSONALITY_VALIDATOR", true);
  }
  return true;
}

export function enableForeshadowValidator(): boolean {
  if (!readNarrativeRhythmParent()) return false;
  if (envRaw("VERSECRAFT_ENABLE_FORESHADOW_VALIDATOR") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_FORESHADOW_VALIDATOR", true);
  }
  return true;
}

export function enableTaskModeValidator(): boolean {
  if (!readNarrativeRhythmParent()) return false;
  if (envRaw("VERSECRAFT_ENABLE_TASK_MODE_VALIDATOR") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_TASK_MODE_VALIDATOR", true);
  }
  return true;
}

export function enableTimeFeelValidator(): boolean {
  if (!readNarrativeRhythmParent()) return false;
  if (envRaw("VERSECRAFT_ENABLE_TIME_FEEL_VALIDATOR") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_TIME_FEEL_VALIDATOR", true);
  }
  return true;
}

/**
 * true：欣蓝沿用较窄的 XINLAN_STRICT 白名单（默认）。
 * false：欣蓝按 N-010 阶梯 neverLeak 全量拦，更严、更少「牵引」空间。
 */
export function enableXinlanRevealSpecialCase(): boolean {
  if (envRaw("VERSECRAFT_ENABLE_XINLAN_REVEAL_SPECIAL_CASE") !== undefined) {
    return envBoolean("VERSECRAFT_ENABLE_XINLAN_REVEAL_SPECIAL_CASE", true);
  }
  return true;
}

/** 人格/节奏调试日志（控制台） */
export function enableNpcPersonalityDebug(): boolean {
  if (envRaw("VERSECRAFT_NPC_PERSONALITY_DEBUG") !== undefined) {
    return envBoolean("VERSECRAFT_NPC_PERSONALITY_DEBUG", false);
  }
  return envBoolean("VERSECRAFT_EPISTEMIC_DEBUG_LOG", false);
}

export function enableNarrativeRhythmGateAny(): boolean {
  return (
    enablePersonalityValidator() ||
    enableForeshadowValidator() ||
    enableTaskModeValidator() ||
    enableTimeFeelValidator()
  );
}

export type NpcNarrativeRolloutFlagsSnapshot = {
  enableNpcPersonalityCoreV2: boolean;
  enableMajorNpcForeshadow: boolean;
  enableTaskModeLayer: boolean;
  enableFineGrainTimeCost: boolean;
  enablePersonalityValidator: boolean;
  enableForeshadowValidator: boolean;
  enableTaskModeValidator: boolean;
  enableTimeFeelValidator: boolean;
  enableXinlanRevealSpecialCase: boolean;
  enableNpcPersonalityDebug: boolean;
};

export function getNpcNarrativeRolloutFlagsSnapshot(): NpcNarrativeRolloutFlagsSnapshot {
  return {
    enableNpcPersonalityCoreV2: enableNpcPersonalityCoreV2(),
    enableMajorNpcForeshadow: enableMajorNpcForeshadow(),
    enableTaskModeLayer: enableTaskModeLayer(),
    enableFineGrainTimeCost: enableFineGrainTimeCost(),
    enablePersonalityValidator: enablePersonalityValidator(),
    enableForeshadowValidator: enableForeshadowValidator(),
    enableTaskModeValidator: enableTaskModeValidator(),
    enableTimeFeelValidator: enableTimeFeelValidator(),
    enableXinlanRevealSpecialCase: enableXinlanRevealSpecialCase(),
    enableNpcPersonalityDebug: enableNpcPersonalityDebug(),
  };
}
