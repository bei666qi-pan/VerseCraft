import type { RouteResult } from "./routing";

/**
 * Global 语义缓存写入硬门：仅 CODEX，且不得含第一人称私密动作强特征。
 * 只缓存 narrative 文本；此函数只决定「是否允许写入 global」。
 */
export function isGlobalCacheSafe(input: string, route: RouteResult): boolean {
  if (route.kind !== "CODEX_QUERY") return false;
  if (route.reasons.some((r) => r.startsWith("first_person:") || r === "pattern:first_person_action")) {
    return false;
  }
  const s = (input ?? "").trim();
  if (/^我/.test(s)) return false;
  if (/我[^，。！？\s]{0,12}?(?:拔|偷|杀|殺|打|吃|喝|去了|要把|已经|已經|受伤|受傷)/.test(s)) return false;
  return true;
}
