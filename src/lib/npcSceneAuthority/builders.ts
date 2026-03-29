/**
 * 场景权威包构建：在场判定、提及模式、外貌与身份门闸。
 */

import { extractNpcIdsFromText } from "@/lib/epistemic/targetNpc";
import { getNpcCanonicalIdentity, isNpcAllowedToKnowRevealTier } from "@/lib/registry/npcCanon";
import { locationsMatch, normalizeLocationKey } from "@/lib/registry/npcCanonBuilders";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";
import type {
  BuildNpcSceneAuthorityInput,
  NpcMentionMode,
  NpcSceneAuthorityPacket,
  NpcSceneRef,
} from "./types";

function normalizeNpcId(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^(n)-(\d{3})$/i);
  if (m) return `N-${m[2]}`;
  return t.toUpperCase();
}

function isPresentAtScene(npcLoc: string | undefined, sceneLoc: string | null): boolean {
  if (!sceneLoc || !npcLoc) return false;
  return locationsMatch(npcLoc, sceneLoc);
}

export function buildNpcSceneAuthority(input: BuildNpcSceneAuthorityInput): NpcSceneAuthorityPacket {
  const sceneLoc = input.currentSceneLocation ? normalizeLocationKey(input.currentSceneLocation) : null;
  const written = new Set(input.sceneAppearanceAlreadyWrittenIds.map(normalizeNpcId));
  const mentioned = new Set(input.mentionedNpcIdsFromInput.map(normalizeNpcId));
  const codex = new Set((input.codexOrHintNpcIds ?? []).map(normalizeNpcId));

  const npcCurrentLocationMap: Record<string, string> = {};
  for (const row of input.npcPositions) {
    const id = normalizeNpcId(row.npcId);
    npcCurrentLocationMap[id] = normalizeLocationKey(row.location);
  }

  const presentNpcIds: string[] = [];
  const offscreenNpcIds: string[] = [];
  for (const row of input.npcPositions) {
    const id = normalizeNpcId(row.npcId);
    if (isPresentAtScene(row.location, sceneLoc)) {
      if (!presentNpcIds.includes(id)) presentNpcIds.push(id);
    } else {
      if (!offscreenNpcIds.includes(id)) offscreenNpcIds.push(id);
    }
  }

  const relevantIds = new Set<string>([
    ...Object.keys(npcCurrentLocationMap),
    ...mentioned,
    ...codex,
  ]);

  const npcMentionModes: Record<string, NpcMentionMode> = {};
  for (const id of relevantIds) {
    if (presentNpcIds.includes(id)) {
      npcMentionModes[id] = "present";
      continue;
    }
    if (mentioned.has(id)) {
      npcMentionModes[id] = "heard_only";
      continue;
    }
    if (codex.has(id)) {
      npcMentionModes[id] = "memory_only";
      continue;
    }
    npcMentionModes[id] = "forbidden";
  }

  const firstAppearanceRequiredNpcIds = presentNpcIds.filter((id) => !written.has(id));

  const npcCanonicalAppearanceMap: NpcSceneAuthorityPacket["npcCanonicalAppearanceMap"] = {};
  const npcPublicRoleMap: Record<string, string> = {};
  const npcDeepRoleLockedMap: Record<string, boolean> = {};
  const revealTierCapsByNpc: Record<string, RevealTierRank> = {};

  for (const id of relevantIds) {
    const canon = getNpcCanonicalIdentity(id);
    npcCanonicalAppearanceMap[id] = {
      short: canon.canonicalAppearanceShort,
      long: canon.canonicalAppearanceLong,
    };
    npcPublicRoleMap[id] = canon.canonicalPublicRole;
    revealTierCapsByNpc[id] = canon.revealTierCap;
    npcDeepRoleLockedMap[id] = !isNpcAllowedToKnowRevealTier(id, REVEAL_TIER_RANK.deep);
  }

  const authorityRulesSummary = [
    `场景坐标=${sceneLoc ?? "未知"}`,
    `在场可对白：${presentNpcIds.join(",") || "无"}`,
    "离场/未在场 NPC：禁止直接开口对白；若玩家提及→heard_only=远处声/传闻式；memory_only=回忆/图鉴式；forbidden=不可具象对谈。",
    "首次出场外貌：仅用 npcCanonicalAppearanceMap 与 firstAppearanceRequiredNpcIds；已写入 sceneAppearanceAlreadyWrittenIds 的禁止重复堆砌外貌。",
    `深层校源身份：npcDeepRoleLockedMap=true 时只保留公寓职能壳，禁止跳层。当前 maxRevealRank=${input.maxRevealRank}。`,
    "若与记忆摘要冲突，以本包为准。",
  ].join("\n");

  return {
    currentSceneLocation: sceneLoc,
    presentNpcIds,
    offscreenNpcIds,
    npcCurrentLocationMap,
    npcMentionModes,
    npcCanonicalAppearanceMap,
    npcPublicRoleMap,
    npcDeepRoleLockedMap,
    firstAppearanceRequiredNpcIds,
    sceneAppearanceAlreadyWrittenIds: [...written],
    revealTierCapsByNpc,
    authorityRulesSummary,
  };
}

export function isNpcPresentInScene(npcId: string, scene: NpcSceneRef): boolean {
  const id = normalizeNpcId(npcId);
  return scene.presentNpcIds.includes(id);
}

export function getNpcMentionMode(npcId: string, packet: NpcSceneAuthorityPacket): NpcMentionMode {
  const id = normalizeNpcId(npcId);
  return packet.npcMentionModes[id] ?? "forbidden";
}

export type CanonicalAppearanceForScene = {
  mode: "full_canon_long" | "full_canon_short" | "behavior_only";
  primary: string;
};

/**
 * 首次出场用 long；已写过外貌→仅行为层；其余在场用 short 兜底。
 */
export function getNpcCanonicalAppearanceForScene(
  npcId: string,
  packet: NpcSceneAuthorityPacket
): CanonicalAppearanceForScene {
  const id = normalizeNpcId(npcId);
  const row = packet.npcCanonicalAppearanceMap[id];
  if (!row) return { mode: "behavior_only", primary: "" };
  if (!packet.presentNpcIds.includes(id)) {
    return { mode: "behavior_only", primary: row.short };
  }
  if (packet.sceneAppearanceAlreadyWrittenIds.includes(id)) {
    return { mode: "behavior_only", primary: row.short };
  }
  if (packet.firstAppearanceRequiredNpcIds.includes(id)) {
    return { mode: "full_canon_long", primary: row.long };
  }
  return { mode: "full_canon_short", primary: row.short };
}

/** 从玩家输入解析提及的 NPC（导出给 route 复用时可不传） */
export function extractMentionedNpcIdsFromUserInput(latestUserInput: string): string[] {
  return extractNpcIdsFromText(latestUserInput);
}

export function extractNpcIdsFromRelationshipHints(hints: string[]): string[] {
  const s = new Set<string>();
  for (const h of hints) {
    for (const m of h.matchAll(/\b(N-\d{3})\b/gi)) {
      s.add((m[1] ?? "").toUpperCase());
    }
  }
  return [...s];
}

/** minimal / 截断路径用的缩写场景权威包 */
export function compactNpcSceneAuthorityPacket(p: NpcSceneAuthorityPacket) {
  const modes = Object.entries(p.npcMentionModes).slice(0, 10);
  return {
    currentSceneLocation: p.currentSceneLocation,
    presentNpcIds: p.presentNpcIds.slice(0, 6),
    offscreenNpcIds: p.offscreenNpcIds.slice(0, 5),
    npcMentionModes: Object.fromEntries(modes),
    firstAppearanceRequiredNpcIds: p.firstAppearanceRequiredNpcIds.slice(0, 5),
    sceneAppearanceAlreadyWrittenIds: p.sceneAppearanceAlreadyWrittenIds.slice(0, 6),
    authorityRulesSummary: p.authorityRulesSummary.slice(0, 260),
  };
}
