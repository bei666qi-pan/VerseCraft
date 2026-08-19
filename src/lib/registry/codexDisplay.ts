import { ANOMALIES } from "@/lib/registry/anomalies";
import { NPCS } from "@/lib/registry/npcs";
import { stripDeveloperFacingFragments } from "@/lib/ui/playerFacingText";
import { QINGSHI_NPCS } from "@/lib/worlds/xingni/qingshiContent";
import { DARK_MOON_WORLD_ID, XINGNI_WORLD_ID, type WorldId } from "@/lib/worlds/types";
import type { CodexEntry } from "@/store/useGameStore";

function resolveNpcWorld(id: string, worldId?: WorldId): WorldId {
  if (worldId) return worldId;
  return id.startsWith("XQ-") ? XINGNI_WORLD_ID : DARK_MOON_WORLD_ID;
}

/** 玩家可见名若长得像内部 id，则改用注册表或泛称兜底 */
export function isLikelyRegistryIdName(name: string): boolean {
  const t = String(name ?? "").trim();
  if (!t) return false;
  return /^(?:N|A)-\d{3}$/i.test(t) || /^XQ-N\d{3}$/i.test(t);
}

export function lookupNpcNameById(id: string, worldId?: WorldId): string | null {
  const key = String(id ?? "").trim();
  if (!key) return null;
  const npcs = resolveNpcWorld(key, worldId) === XINGNI_WORLD_ID ? QINGSHI_NPCS : NPCS;
  return npcs.find((x) => x.id === key)?.name ?? null;
}

export function lookupAnomalyNameById(id: string, worldId?: WorldId): string | null {
  const key = String(id ?? "").trim();
  if (!key) return null;
  if (worldId === XINGNI_WORLD_ID) return null;
  return ANOMALIES.find((x) => x.id === key)?.name ?? null;
}

/** 从 anomalies.ts combatName 查找战斗层指定名，无匹配时返回 null。 */
export function lookupAnomalyCombatNameById(id: string): string | null {
  const key = String(id ?? "").trim();
  if (!key) return null;
  return ANOMALIES.find((x) => x.id === key)?.combatName ?? null;
}

export function resolveCodexDisplayName(
  entry: Pick<CodexEntry, "id" | "name" | "type">,
  worldId?: WorldId,
): string {
  const rawName = String(entry?.name ?? "").trim();
  const rawId = String(entry?.id ?? "").trim();

  const nameLooksBad = !rawName || isLikelyRegistryIdName(rawName);
  if (!nameLooksBad) return rawName;

  const fromRegistry =
    entry.type === "npc" ? lookupNpcNameById(rawId, worldId) : entry.type === "anomaly" ? lookupAnomalyNameById(rawId, worldId) : null;
  if (fromRegistry) return fromRegistry;
  if (entry.type === "npc") return "某位住户";
  if (entry.type === "anomaly") return "某类异常";
  return rawName || "未知条目";
}

export type CodexRelationshipLabel = "暂无" | "盟友" | "敌人";

export function computeRelationshipLabel(entry: Pick<
  CodexEntry,
  "type" | "betrayalFlags" | "favorability" | "fear" | "trust"
>): CodexRelationshipLabel {
  if (entry.type !== "npc") return "暂无";

  const betrayal = Array.isArray(entry.betrayalFlags) ? entry.betrayalFlags.filter((x) => typeof x === "string") : [];
  const favor = typeof entry.favorability === "number" && Number.isFinite(entry.favorability) ? entry.favorability : 0;
  const fear = typeof entry.fear === "number" && Number.isFinite(entry.fear) ? entry.fear : 0;
  const trust = typeof entry.trust === "number" && Number.isFinite(entry.trust) ? entry.trust : 0;

  if (betrayal.length > 0 || favor <= -20 || fear >= 40) return "敌人";
  if (trust >= 40 || favor >= 50) return "盟友";
  return "暂无";
}

function toShortSentence(text: string, maxLen: number): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen).trim();
}

export function buildCodexIntro(entry: Pick<CodexEntry, "id" | "type">, worldId?: WorldId): string {
  const id = String(entry?.id ?? "").trim();
  if (!id) return "";
  if (entry.type === "npc") {
    const resolvedWorldId = resolveNpcWorld(id, worldId);
    const npc = resolvedWorldId === DARK_MOON_WORLD_ID ? NPCS.find((x) => x.id === id) : null;
    if (!npc) {
      const qingshiNpc = resolvedWorldId === XINGNI_WORLD_ID ? QINGSHI_NPCS.find((x) => x.id === id) : null;
      return qingshiNpc
        ? stripDeveloperFacingFragments(`${qingshiNpc.role}，修为${qingshiNpc.realm}。`)
        : "";
    }
    const a = stripDeveloperFacingFragments(toShortSentence(npc.appearance, 90));
    const lore = stripDeveloperFacingFragments(toShortSentence(npc.lore, 72));
    const taboo = stripDeveloperFacingFragments(toShortSentence(npc.taboo, 72));
    const lines = [a, lore ? `坊间印象：${lore}` : "", taboo ? `忌讳：${taboo}` : ""].filter(Boolean);
    return stripDeveloperFacingFragments(lines.join("\n"));
  }
  if (entry.type === "anomaly") {
    if (worldId === XINGNI_WORLD_ID) return "";
    const an = ANOMALIES.find((x) => x.id === id);
    if (!an) return "";
    const a = stripDeveloperFacingFragments(toShortSentence(an.appearance, 100));
    const rule = stripDeveloperFacingFragments(toShortSentence(an.killingRule, 72));
    const survive = stripDeveloperFacingFragments(toShortSentence(an.survivalMethod, 72));
    const lines = [a, rule ? `出事征兆：${rule}` : "", survive ? `怎么躲：${survive}` : ""].filter(Boolean);
    return stripDeveloperFacingFragments(lines.join("\n"));
  }
  return "";
}
