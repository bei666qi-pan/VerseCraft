/**
 * 兼容与降级：未知 ID、部分覆盖、纠偏后的合并身份卡。
 */

import type { NPC, NpcCanonicalIdentity } from "./types";
import { REVEAL_TIER_RANK } from "./revealTierRank";
import { CORE_NPC_PROFILES_V2 } from "./npcProfiles";
import { NPCS } from "./npcs";
import {
  buildCanonicalIdentityCard,
  clampPlayerRecognitionMode,
  DEFAULT_BASELINE_VIEW_OF_PLAYER,
  resolveMemoryPrivilegeForNpcId,
} from "./npcCanonBuilders";

const BASE_ANTI_UNKNOWN: readonly string[] = [
  "禁止编造未在注册表出现的 NPC 关系与私密事实。",
  "未知实体：对白须克制，不扩展为具体设定。",
];

function normalizeNpcId(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^(n)-(\d{3})$/i);
  if (m) return `N-${m[2]}`;
  return t.toUpperCase();
}

function buildUnknownCanonicalIdentity(id: string): NpcCanonicalIdentity {
  return {
    npcId: id,
    canonicalName: "未知实体",
    canonicalGender: "unknown",
    canonicalAddressing: "中性描述，避免编造具体性别称谓直至登记。",
    ageBand: "ambiguous",
    studentAffinityType: "surface_stranger_student",
    apartmentSurfaceIdentity: "未在注册表登记：禁止编造具体房间号与固定职能。",
    fragmentSchoolIdentity: "无校源叙事权限：不得编造耶里与七锚细节。",
    canonicalAppearanceShort: "（未登记）",
    canonicalAppearanceLong: "（未登记）",
    canonicalPersonalityCore: "未登记",
    canonicalSpeechCore: "短句、克制，不抢跑设定。",
    canonicalPublicRole: "未登记",
    canonicalDeepRole: "未登记",
    canonicalHomeLocation: "未知",
    allowedSpawnLocations: ["未知"],
    memoryPrivilege: "normal",
    playerRecognitionMode: "none",
    baselineViewOfPlayer: DEFAULT_BASELINE_VIEW_OF_PLAYER,
    canKnowPlayerCoreIdentity: false,
    canKnowLoopTruth: false,
    revealTierCap: REVEAL_TIER_RANK.surface,
    antiFabricationHints: [...BASE_ANTI_UNKNOWN, `rawId=${id}`],
  };
}

/**
 * 合并部分覆盖并纠偏；缺失基线时回退默认世界观；未知 npcId 时生成安全占位卡。
 */
export function normalizeNpcCanonOrFallback(
  npcId: string,
  partial: Partial<NpcCanonicalIdentity> | null | undefined,
  npcRow?: NPC | null
): NpcCanonicalIdentity {
  const id = normalizeNpcId(npcId);
  const npc = npcRow ?? NPCS.find((n) => n.id === id) ?? null;
  const v2 = CORE_NPC_PROFILES_V2.find((p) => p.id === id) ?? null;
  const base = npc ? buildCanonicalIdentityCard(npc, v2) : buildUnknownCanonicalIdentity(id);
  const patch =
    partial != null
      ? (Object.fromEntries(
          Object.entries(partial).filter(([, v]) => v !== undefined)
        ) as Partial<NpcCanonicalIdentity>)
      : {};
  const merged: NpcCanonicalIdentity = {
    ...base,
    ...patch,
    npcId: id,
    memoryPrivilege: patch.memoryPrivilege ?? base.memoryPrivilege,
    allowedSpawnLocations: patch.allowedSpawnLocations ?? base.allowedSpawnLocations,
    antiFabricationHints: patch.antiFabricationHints ?? base.antiFabricationHints,
  };
  if (!merged.baselineViewOfPlayer?.trim()) {
    merged.baselineViewOfPlayer = DEFAULT_BASELINE_VIEW_OF_PLAYER;
  }
  merged.playerRecognitionMode = clampPlayerRecognitionMode(
    merged.memoryPrivilege,
    merged.playerRecognitionMode
  );
  return merged;
}

/** @internal 供需要与 resolveMemoryPrivilegeForNpcId 对齐的模块使用 */
export function inferMemoryPrivilegeFromPartial(
  npcId: string,
  override?: NpcCanonicalIdentity["memoryPrivilege"]
): NpcCanonicalIdentity["memoryPrivilege"] {
  return override ?? resolveMemoryPrivilegeForNpcId(normalizeNpcId(npcId));
}
