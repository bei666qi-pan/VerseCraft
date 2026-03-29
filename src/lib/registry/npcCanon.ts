/**
 * NPC 权威身份卡注册表与查询 helper（单一导入入口）。
 */

import type { NpcCanonicalIdentity, NpcMemoryPrivilege, NpcPlayerRecognitionMode } from "./types";
import type { RevealTierRank } from "./revealTierRank";
import { CORE_NPC_PROFILES_V2 } from "./npcProfiles";
import { NPCS } from "./npcs";
import { buildCanonicalIdentityCard } from "./npcCanonBuilders";
import { normalizeNpcCanonOrFallback } from "./npcCanonCompat";

function normalizeNpcId(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^(n)-(\d{3})$/i);
  if (m) return `N-${m[2]}`;
  return t.toUpperCase();
}

const _byId: Record<string, NpcCanonicalIdentity> = {};
for (const n of NPCS) {
  const v2 = CORE_NPC_PROFILES_V2.find((p) => p.id === n.id) ?? null;
  _byId[n.id] = buildCanonicalIdentityCard(n, v2);
}

/** 全量只读注册表 */
export const NPC_CANONICAL_IDENTITY_BY_ID: Readonly<Record<string, NpcCanonicalIdentity>> = Object.freeze(
  { ..._byId }
);

export function getNpcCanonicalIdentity(npcId: string): NpcCanonicalIdentity {
  const id = normalizeNpcId(npcId);
  const row = NPC_CANONICAL_IDENTITY_BY_ID[id];
  if (row) return row;
  return normalizeNpcCanonOrFallback(id, null);
}

/** 用于观测/灰度：焦点 NPC id 是否在注册表内（未知 id 会走安全占位卡）。 */
export function isRegisteredCanonicalNpcId(npcId: string): boolean {
  const id = normalizeNpcId(npcId);
  return Object.prototype.hasOwnProperty.call(NPC_CANONICAL_IDENTITY_BY_ID, id);
}

export function getNpcMemoryPrivilege(npcId: string): NpcMemoryPrivilege {
  return getNpcCanonicalIdentity(npcId).memoryPrivilege;
}

export function getNpcPlayerRecognitionMode(npcId: string): NpcPlayerRecognitionMode {
  return getNpcCanonicalIdentity(npcId).playerRecognitionMode;
}

export function getNpcAllowedSpawnLocations(npcId: string): readonly string[] {
  return getNpcCanonicalIdentity(npcId).allowedSpawnLocations;
}

export function getNpcBaselineViewOfPlayer(npcId: string): string {
  return getNpcCanonicalIdentity(npcId).baselineViewOfPlayer;
}

/**
 * 该 NPC 是否允许在叙事中「知道」不高于某 reveal 档位的事实（数值比较）。
 */
export function isNpcAllowedToKnowRevealTier(npcId: string, tier: RevealTierRank): boolean {
  const cap = getNpcCanonicalIdentity(npcId).revealTierCap;
  return cap >= tier;
}

export { normalizeNpcCanonOrFallback } from "./npcCanonCompat";
export {
  resolveNpcRuntimeLocation,
  type RuntimeLocationResolveResult,
} from "./npcCanonBuilders";
export { XINLAN_NPC_ID, NIGHT_READER_NPC_ID } from "./npcCanonBuilders";
