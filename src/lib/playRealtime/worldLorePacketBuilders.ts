import { PLAYER_SURFACE_LORE } from "@/lib/registry/playerSurfaceLore";
import { REVEAL_TIER_METAS } from "@/lib/registry/revealRegistry";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";
import { WORLD_ORDER_CANON } from "@/lib/registry/worldOrderRegistry";
import { buildMajorNpcKeyHintsForPacket } from "@/lib/registry/majorNpcDeepCanon";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { NPCS } from "@/lib/registry/npcs";
import type { FloorLoreEntry } from "@/lib/registry/floorLoreRegistry";
import type { PlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import type { ThreatSnapshot } from "./stage2Packets";

function normalizeNpcAppearanceForPacket(text: string): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.slice(0, 120);
}

export function buildFloorLorePacket(args: {
  signals: PlayerWorldSignals;
  floorLore: FloorLoreEntry | null;
  maxRevealRank: RevealTierRank;
}): Record<string, unknown> {
  const { floorLore: fl, maxRevealRank } = args;
  if (!fl) {
    return {
      floorId: args.signals.residentialFloorNum,
      note: args.signals.isB1 ? "B1_stable_band" : args.signals.isB2 ? "B2_exit_zone" : "unknown_residential_slice",
      surfaceHint: args.signals.isB1 ? PLAYER_SURFACE_LORE.b1_safe : PLAYER_SURFACE_LORE.arrival,
    };
  }
  const out: Record<string, unknown> = {
    floorId: fl.floorId,
    linkedAnomalyId: fl.linkedAnomalyId,
    publicTheme: fl.publicTheme,
    publicOmen: fl.publicOmen,
    digestionStage: fl.digestionStage,
    truthProgressHint: maxRevealRank >= 1 ? fl.truthProgress : null,
  };
  if (maxRevealRank >= 1) {
    out.hiddenTheme = fl.hiddenTheme;
    out.mainThreatMapping = fl.mainThreatMapping;
    out.systemHooks = fl.systemNaturalization;
    out.professionBias = fl.professionBias;
  }
  if (maxRevealRank >= 2) {
    out.hiddenCausal = fl.hiddenCausal;
  }
  return out;
}

export function buildThreatLorePacket(args: {
  threat: ThreatSnapshot;
  floorLore: FloorLoreEntry | null;
  maxRevealRank: RevealTierRank;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    floorId: args.threat.floorId,
    activeThreatId: args.threat.threatId,
    activeThreatName: args.threat.threatName,
    phase: args.threat.phase,
    suppressionProgress: args.threat.suppressionProgress,
  };
  if (args.floorLore && args.floorLore.linkedAnomalyId === args.threat.threatId) {
    base.digestionLink = args.floorLore.mainThreatMapping;
    if (args.maxRevealRank >= 1) base.publicOmen = args.floorLore.publicOmen;
  }
  if (args.maxRevealRank >= 2 && args.floorLore) {
    base.telegraphCausal = args.floorLore.hiddenCausal;
  }
  return base;
}

export function buildB1OrderPacket(args: { signals: PlayerWorldSignals; servicesAtLocation: unknown[] }): Record<string, unknown> {
  const b1Canon = WORLD_ORDER_CANON.find((x) => x.id === "b1_stability_band");
  return {
    isB1: args.signals.isB1,
    serviceKindsAtNode: args.servicesAtLocation,
    orderSnippet: args.signals.isB1 && b1Canon ? b1Canon.worldLogic.slice(0, 220) : null,
    surfaceSnippet: args.signals.isB1 ? PLAYER_SURFACE_LORE.b1_safe : null,
  };
}

export function buildReviveAnchorLorePacket(args: {
  signals: PlayerWorldSignals;
  anchorUnlocks: { B1: boolean; "1": boolean; "7": boolean };
  revive: Record<string, unknown> | null;
  maxRevealRank: RevealTierRank;
}): Record<string, unknown> {
  const reviveEntry = WORLD_ORDER_CANON.find((x) => x.id === "revive_anchor");
  return {
    anchors: args.anchorUnlocks,
    hasRecentRevive: args.signals.hasReviveLine,
    deathCount: args.signals.deathCount,
    lastReviveSummary: args.revive,
    anchorRebuiltThisCycle: args.signals.anchorRebuiltThisCycle,
    structuredCrossRef:
      args.maxRevealRank >= REVEAL_TIER_RANK.deep ? "cycle_time_packet" : null,
    narrativeBudget:
      args.maxRevealRank >= 1 && reviveEntry
        ? reviveEntry.worldLogic.slice(0, 240)
        : args.signals.hasReviveLine
          ? "重构伴随时间推进与随身物损耗，勿当作无代价重置。"
          : null,
  };
}

export function buildOriginiumEconomyPacket(args: {
  signals: PlayerWorldSignals;
  maxRevealRank: RevealTierRank;
}): Record<string, unknown> {
  const originEntry = WORLD_ORDER_CANON.find((x) => x.id === "originium");
  return {
    originiumCount: args.signals.originium,
    economySnippet:
      args.maxRevealRank >= 1 && originEntry ? originEntry.worldLogic.slice(0, 220) : null,
    surfaceRumor: args.maxRevealRank === 0 ? PLAYER_SURFACE_LORE.originium_rumor : null,
  };
}

export function buildKeyNpcLorePacket(args: {
  nearbyNpcIds: string[];
  relationshipHints: string[];
  worldFlags: string[];
  maxRevealRank: RevealTierRank;
}): Record<string, unknown> {
  const elder = WORLD_ORDER_CANON.find((x) => x.id === "elder_steward");
  const merchant = WORLD_ORDER_CANON.find((x) => x.id === "wandering_merchant");
  const includeElder =
    args.nearbyNpcIds.includes("N-011") || args.relationshipHints.some((h) => h.includes("夜读"));
  const includeMerchant = args.worldFlags.includes("merchant_seen");
  const nearbyNpcBriefs = args.nearbyNpcIds
    .map((id) => {
      const npc = NPCS.find((x) => x.id === id);
      if (!npc) return null;
      const canon = getNpcCanonicalIdentity(id);
      return {
        id: npc.id,
        name: npc.name,
        appearance: normalizeNpcAppearanceForPacket(npc.appearance),
        canonicalGender: canon.canonicalGender,
        canonicalAddressing: canon.canonicalAddressing.slice(0, 160),
        memoryPrivilege: canon.memoryPrivilege,
        baselineViewOfPlayer: canon.baselineViewOfPlayer.slice(0, 120),
      };
    })
    .filter(Boolean)
    .slice(0, 6);
  return {
    nearbyNpcIds: args.nearbyNpcIds.slice(0, 8),
    nearbyNpcBriefs,
    major_npc_bridge_hints: buildMajorNpcKeyHintsForPacket({
      nearbyNpcIds: args.nearbyNpcIds,
      maxRevealRank: args.maxRevealRank,
    }),
    codexHintsTruncated: args.relationshipHints.slice(0, 8),
    elderOrderHint:
      includeElder && args.maxRevealRank >= 2 && elder ? elder.worldLogic.slice(0, 200) : null,
    merchantHint:
      includeMerchant && args.maxRevealRank >= 1 && merchant ? merchant.worldLogic.slice(0, 180) : null,
  };
}

export function buildRecentWorldEventPacket(args: {
  worldFlags: string[];
  revive: Record<string, unknown> | null;
  activeTaskTitles: string[];
}): Record<string, unknown> {
  const recentFlags = args.worldFlags.filter((f) => /revive|conspiracy|merchant|truth|profession|dark/i.test(f));
  return {
    activeTaskTitles: args.activeTaskTitles.slice(0, 6),
    flaggedEvents: recentFlags.slice(0, 10),
    reviveEcho: args.revive
      ? { anchorId: args.revive.lastReviveAnchorId, drops: args.revive.droppedLootCount }
      : null,
  };
}

export function buildRevealTierPacket(args: {
  signals: PlayerWorldSignals;
  maxRevealRank: RevealTierRank;
  firedRuleIds: string[];
}): Record<string, unknown> {
  const tierMeta = REVEAL_TIER_METAS[Math.min(args.maxRevealRank, REVEAL_TIER_METAS.length - 1)];
  return {
    maxRevealRank: args.maxRevealRank,
    tierId: tierMeta?.id ?? "surface",
    tierPolicy: tierMeta?.revealPolicy ?? "",
    firedGateRuleIds: args.firedRuleIds.slice(0, 12),
    professionGateNote: args.signals.professionAnyCertified
      ? "职业认证路径已触发深层揭露预算。"
      : null,
  };
}

export { buildMajorNpcRelinkPacket, buildMajorNpcRelinkPacketCompact } from "@/lib/registry/majorNpcRelinkRegistry";
export { PARTY_RELINK_REGISTRY } from "@/lib/registry/partyRelinkRegistry";
export {
  buildCycleLoopPacket,
  buildMajorNpcArcPacket,
  buildSchoolSourcePacket,
  buildTeamRelinkPacket,
} from "@/lib/registry/worldSchoolRuntimePackets";
