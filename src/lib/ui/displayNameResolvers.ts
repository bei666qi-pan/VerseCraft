/**
 * 玩家界面专用：实体 id → 可读名称，禁止把 N-xxx / A-xxx 原样展示。
 */
import type { CodexEntry } from "@/store/useGameStore";
import {
  lookupAnomalyNameById,
  lookupNpcNameById,
  resolveCodexDisplayName,
} from "@/lib/registry/codexDisplay";
import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import { FLOORS } from "@/lib/registry/world";

const FLOOR_TIER_LABEL: Record<string, string> = Object.fromEntries(
  FLOORS.map((f) => [f.id, f.label])
);

function isRegistryNpcId(id: string): boolean {
  return /^N-\d{3}$/i.test(id.trim());
}

function isRegistryAnomalyId(id: string): boolean {
  return /^A-\d{3}$/i.test(id.trim());
}

/** 展示用 id 形态（含常见脏名） */
export function looksLikeInternalEntityId(token: string): boolean {
  const t = String(token ?? "").trim();
  if (!t) return false;
  return isRegistryNpcId(t) || isRegistryAnomalyId(t);
}

export function resolveNpcIdForPlayer(id: string, codex?: Record<string, CodexEntry> | null): string {
  const key = String(id ?? "").trim();
  if (!key) return "某位住户";
  const entry = codex?.[key];
  if (entry?.type === "npc") {
    return resolveCodexDisplayName(entry);
  }
  return lookupNpcNameById(key) ?? "某位住户";
}

export function resolveAnomalyIdForPlayer(id: string, codex?: Record<string, CodexEntry> | null): string {
  const key = String(id ?? "").trim();
  if (!key) return "某类异常";
  const entry = codex?.[key];
  if (entry?.type === "anomaly") {
    return resolveCodexDisplayName(entry);
  }
  return lookupAnomalyNameById(key) ?? "某类异常";
}

export function resolveItemIdForPlayer(id: string): string {
  const it = findRegisteredItemById(id);
  return it?.name?.trim() ? it.name.trim() : "未知道具";
}

export function resolveFloorTierLabel(floorTier: string): string {
  const t = String(floorTier ?? "").trim();
  if (!t) return "位置未定";
  return FLOOR_TIER_LABEL[t] ?? `约 ${t} 一带`;
}

/** 保底：避免任何玩家可见文本残留内部 id token。 */
export function scrubInternalEntityIdsForPlayer(text: string, codex?: Record<string, CodexEntry> | null): string {
  let s = String(text ?? "");
  if (!s) return "";
  // 替换孤立 token（避免在中文段落中出现 N-013 这种“开发感”）
  s = s.replace(/\bN-\d{3}\b/gi, (m) => resolveNpcIdForPlayer(m, codex));
  s = s.replace(/\bA-\d{3}\b/gi, (m) => resolveAnomalyIdForPlayer(m, codex));
  return s.trim();
}

/**
 * 手记/任务里出现的 npc id 列表 → 玩家可读名（不暴露 registry id）。
 */
export function resolveNpcRefListForPlayer(ids: string[] | undefined, codex?: Record<string, CodexEntry> | null): string {
  if (!ids?.length) return "";
  return ids
    .slice(0, 4)
    .map((id) => resolveNpcIdForPlayer(String(id), codex))
    .join("、");
}

/** 任务委托人一行：若 issuerName 被写成了 id，或需与 codex 对齐时兜底。 */
export function resolveTaskIssuerDisplay(
  issuerId: string,
  issuerName: string,
  codex?: Record<string, CodexEntry> | null
): string {
  const name = String(issuerName ?? "").trim();
  const id = String(issuerId ?? "").trim();
  if (name && !looksLikeInternalEntityId(name)) return name;
  if (id && id !== "unknown_issuer" && id !== "SYSTEM") {
    if (isRegistryNpcId(id)) return resolveNpcIdForPlayer(id, codex);
    if (isRegistryAnomalyId(id)) return resolveAnomalyIdForPlayer(id, codex);
  }
  if (name === "SYSTEM" || id === "SYSTEM") return "公寓规则";
  return scrubInternalEntityIdsForPlayer(name || "未知托付人", codex);
}
