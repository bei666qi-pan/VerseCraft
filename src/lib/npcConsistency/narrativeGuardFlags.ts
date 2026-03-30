import { envBoolean } from "@/lib/config/envRaw";
import { envRaw } from "@/lib/config/envRaw";

function readOverride(key: string, fallback: boolean): boolean {
  if (envRaw(key) !== undefined) return envBoolean(key, fallback);
  return fallback;
}

/**
 * 阶段10：统一叙事质量裁决层开关（连续性/POV/性别代词）。
 * - 默认全开，便于“系统级稳定性”；
 * - 若线上需要回滚，可逐项关闭；
 * - composite 总开关关闭时，各子 guard 亦视为关闭（避免双层重复裁决）。
 */
export function enableCompositeNarrativeGuard(): boolean {
  return envBoolean("VERSECRAFT_ENABLE_COMPOSITE_NARRATIVE_GUARD", true);
}

export function enableContinuityGuard(): boolean {
  return readOverride("VERSECRAFT_ENABLE_CONTINUITY_GUARD", true) && enableCompositeNarrativeGuard();
}

export function enableFirstPersonGuard(): boolean {
  return readOverride("VERSECRAFT_ENABLE_FIRST_PERSON_GUARD", true) && enableCompositeNarrativeGuard();
}

export function enableGenderPronounGuard(): boolean {
  return readOverride("VERSECRAFT_ENABLE_GENDER_PRONOUN_GUARD", true) && enableCompositeNarrativeGuard();
}

export function enableNarrativeGuardDebug(): boolean {
  return envBoolean("VERSECRAFT_ENABLE_NARRATIVE_GUARD_DEBUG", false);
}

