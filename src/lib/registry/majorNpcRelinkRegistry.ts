/**
 * 旧七人阵重连：由 `partyRelinkRegistry` 提供骨架，本模块做阶段裁决与 packet 组装。
 * 叙事与情绪交给大模型；禁止 instant party、牵引类型、揭露许可由系统计算。
 */

import { MAJOR_NPC_DEEP_CANON, MAJOR_NPC_IDS, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import { NPCS } from "@/lib/registry/npcs";
import {
  PARTY_RELINK_REGISTRY,
  type PartyFractureHintStyle,
  type PartyFirstContactMode,
  type PartyPhase3Traction,
  type PartyRelinkSkeleton,
} from "@/lib/registry/partyRelinkRegistry";
import type { PlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import type { RevealTierRank } from "@/lib/registry/revealTierRank";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";

export const XINLAN_MAJOR_NPC_ID: MajorNpcId = "N-010";

/** @deprecated 使用 PartyRelinkSkeleton；保留别名以兼容旧 import */
export type MajorNpcRelinkSkeleton = PartyRelinkSkeleton;
export type FirstContactMode = PartyFirstContactMode;
export type PivotTractionKind = PartyPhase3Traction;

export type RelinkPhase = 1 | 2 | 3;
export type RelinkPhaseKey = "functional_shell" | "duty_echo" | "array_aligned";

export const MAJOR_NPC_RELINK_SKELETON = PARTY_RELINK_REGISTRY;

function deepRevealUnlocksForRank(sk: PartyRelinkSkeleton, maxRevealRank: RevealTierRank): string[] {
  if (maxRevealRank < REVEAL_TIER_RANK.fracture) return [];
  const u = sk.deepRevealUnlocks;
  if (maxRevealRank < REVEAL_TIER_RANK.deep) return u.slice(0, 1);
  if (maxRevealRank < REVEAL_TIER_RANK.abyss) return u.slice(0, 2);
  return u;
}

const CODEX_LINE_RE = /图鉴已解锁：(.+?)(?:。|$)/;

const NPC_NAME_TO_ID = new Map<string, string>(
  NPCS.map((n) => [n.name.trim(), n.id] as [string, string])
);

/** 按 NPC id 聚合图鉴好感（名称或 N-xxx 键） */
export function parseCodexFavorByNpcId(playerContext: string): Record<string, number> {
  const raw = playerContext.match(CODEX_LINE_RE)?.[1]?.trim();
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const chunk of raw.split("，")) {
    const mm = chunk.trim().match(/^(.+?)\[[^\]]*好感(-?\d+)\]/);
    if (!mm) continue;
    const label = (mm[1] ?? "").trim();
    const fav = Number.parseInt(mm[2] ?? "0", 10) || 0;
    if (/^N-\d+$/.test(label)) {
      out[label] = Math.max(out[label] ?? 0, fav);
      continue;
    }
    const id = NPC_NAME_TO_ID.get(label);
    if (id) out[id] = Math.max(out[id] ?? 0, fav);
  }
  return out;
}

function buildTriggerHaystack(playerContext: string, taskTitles: string[]): string {
  const taskTrack = playerContext.match(/任务追踪：([^。]+)。/)?.[1] ?? "";
  const proactive = playerContext.match(/任务发放线索：([^。]+)。/)?.[1] ?? "";
  return `${taskTrack}\n${proactive}\n${taskTitles.join("\n")}`.toLowerCase();
}

function matchesAnyNeedle(haystack: string, needles: string[]): boolean {
  return needles.some((n) => n && haystack.includes(n.toLowerCase()));
}

function matchesWorldFlags(flags: string[], needles: string[]): boolean {
  const lower = flags.map((f) => f.toLowerCase());
  return needles.some((n) => {
    const nn = n.toLowerCase();
    return lower.some((f) => f.includes(nn));
  });
}

const PIVOT_FLAG_SUBSTRINGS = ["relink", "seven", "七锚", "旧阵", "old_array", "first_relink", "名册"];

export function computeXinlanPivotOpen(args: {
  xinlanFavor: number;
  maxRevealRank: RevealTierRank;
  worldFlags: string[];
}): boolean {
  if (args.xinlanFavor >= 25) return true;
  if (args.maxRevealRank >= REVEAL_TIER_RANK.fracture) return true;
  return matchesWorldFlags(args.worldFlags, PIVOT_FLAG_SUBSTRINGS);
}

export function computeCrisisJoinWindowActive(signals: PlayerWorldSignals): boolean {
  if (signals.deathCount >= 1) return true;
  if (signals.hasReviveLine) return true;
  for (const v of Object.values(signals.mainThreatByFloor)) {
    if (v.phase === "breached") return true;
  }
  const loc = signals.locationNode ?? "";
  for (const [floorId, v] of Object.entries(signals.mainThreatByFloor)) {
    if (v.phase !== "breached" || !floorId) continue;
    if (loc.startsWith(floorId) || loc.includes(floorId)) return true;
  }
  return false;
}

function phaseKeyFor(p: RelinkPhase): RelinkPhaseKey {
  if (p === 1) return "functional_shell";
  if (p === 2) return "duty_echo";
  return "array_aligned";
}

function resolvePhase3Traction(args: {
  skeleton: PartyRelinkSkeleton;
  crisisUsed: boolean;
  favorMet: boolean;
  taskMet: boolean;
}): PartyPhase3Traction {
  if (args.crisisUsed) return "crisis_pressure";
  if (args.taskMet && !args.favorMet) return args.skeleton.primaryPhase3Traction;
  if (args.favorMet && args.skeleton.primaryPhase3Traction === "deja_resonance") return "deja_resonance";
  if (args.favorMet) return "xinlan_pull";
  return args.skeleton.primaryPhase3Traction === "crisis_pressure" ? "crisis_pressure" : "mixed";
}

export interface MajorNpcRelinkEntry {
  npcId: MajorNpcId;
  displayName: string;
  relinkPhase: RelinkPhase;
  phaseKey: RelinkPhaseKey;
  /** 当前阶段系统标签（与 relinkStageLabels 对齐） */
  relinkStageLabel: string;
  inOldLoop: boolean;
  surfaceRelationDominant: boolean;
  deepEchoUnlocked: boolean;
  mayAdvanceReveal: boolean;
  phase3Traction: PartyPhase3Traction | null;
  systemLockedSummary: string;
  nextMechanicalHints: string[];
  /** 是否已进入旧阵核心并队许可（阶段 3，仍非全程 RPG 跟宠） */
  canEnterCoreParty: boolean;
  /** fracture 档关系线是否系统开放 */
  fractureRelationshipLineOpen: boolean;
  /** deep 档关系线是否系统开放 */
  deepRelationshipLineOpen: boolean;
  /** 是否允许触发团队向/多锚聚合类任务（由任务系统再二次门闸） */
  mayTriggerTeamScopedTasks: boolean;
  /** 是否允许情感记忆回潮类叙事（模型表现，系统给许可位） */
  emotionalMemoryFlashLicensed: boolean;
  closedLoopWeight: number;
  fractureHintStyle: PartyFractureHintStyle;
  /** 按揭露档裁剪后的 deepRevealUnlocks 摘要 */
  deepRevealUnlocksActive: string[];
  /** 骨架只读摘要（packet 短用） */
  tractionAttribution: PartyPhase3Traction | "none";
}

export interface MajorNpcRelinkPacket {
  schema: "major_npc_relink_v1";
  xinlanPivotOpen: boolean;
  crisisJoinWindowActive: boolean;
  xinlanRelinkPhase: RelinkPhase;
  entries: MajorNpcRelinkEntry[];
}

export interface MajorNpcRelinkPacketCompact {
  schema: "major_npc_relink_v1";
  xinlanPivotOpen: boolean;
  crisisJoinWindowActive: boolean;
  xinlanPh: RelinkPhase;
  rows: Array<{
    id: MajorNpcId;
    ph: RelinkPhase;
    loop: boolean;
    surf: boolean;
    deep: boolean;
    rev: boolean;
    tr: PartyPhase3Traction | "—";
    party: boolean;
    team: boolean;
    mf: boolean;
    w: number;
  }>;
}

export function computeMajorNpcRelinkStates(args: {
  playerContext: string;
  signals: PlayerWorldSignals;
  nearbyNpcIds: string[];
  maxRevealRank: RevealTierRank;
}): MajorNpcRelinkEntry[] {
  const favorById = parseCodexFavorByNpcId(args.playerContext);
  const haystack = buildTriggerHaystack(args.playerContext, args.signals.activeTaskTitles);
  const nearby = new Set(args.nearbyNpcIds);
  const xinlanFavor = favorById[XINLAN_MAJOR_NPC_ID] ?? 0;
  const pivotOpen = computeXinlanPivotOpen({
    xinlanFavor,
    maxRevealRank: args.maxRevealRank,
    worldFlags: args.signals.worldFlags,
  });
  const crisis = computeCrisisJoinWindowActive(args.signals);

  const entries: MajorNpcRelinkEntry[] = [];

  for (const id of MAJOR_NPC_IDS) {
    const sk = PARTY_RELINK_REGISTRY[id];
    const deep = MAJOR_NPC_DEEP_CANON[id];
    const favor = favorById[id] ?? 0;

    const taskHit = matchesAnyNeedle(haystack, sk.relinkTriggerTasks);
    const flagHit = matchesWorldFlags(args.signals.worldFlags, sk.relinkTriggerSignals);
    const nearbyBoost = nearby.has(id) && favor >= 1;

    let phase: RelinkPhase = 1;
    if (favor >= sk.trustFloor.minFavorPhase2 || taskHit || flagHit || nearbyBoost) {
      phase = 2;
    }

    const favorP3 = favor >= sk.trustFloor.minFavorPhase3;
    const taskP3 = taskHit;
    const ownPhase3Gate = favorP3 || taskP3;

    let crisisUsedForPhase3 = false;
    if (phase >= 2 && ownPhase3Gate) {
      if (pivotOpen || id === XINLAN_MAJOR_NPC_ID) {
        phase = 3;
        crisisUsedForPhase3 = false;
      } else if (crisis) {
        phase = 3;
        crisisUsedForPhase3 = true;
      }
    }

    const phase3Traction: PartyPhase3Traction | null =
      phase === 3
        ? resolvePhase3Traction({
            skeleton: sk,
            crisisUsed: crisisUsedForPhase3,
            favorMet: favorP3,
            taskMet: taskP3,
          })
        : null;

    const inOldLoop = phase === 3;
    const surfaceRelationDominant = phase === 1;
    const deepEchoUnlocked = phase >= 2;
    const mayAdvanceReveal =
      deepEchoUnlocked &&
      (phase === 3
        ? args.maxRevealRank >= REVEAL_TIER_RANK.deep
        : args.maxRevealRank >= REVEAL_TIER_RANK.fracture);

    const fractureRelationshipLineOpen =
      deepEchoUnlocked && args.maxRevealRank >= REVEAL_TIER_RANK.fracture;
    const deepRelationshipLineOpen = phase === 3 && args.maxRevealRank >= REVEAL_TIER_RANK.deep;
    const canEnterCoreParty = inOldLoop;
    const mayTriggerTeamScopedTasks =
      phase >= 2 && (pivotOpen || crisis || id === XINLAN_MAJOR_NPC_ID);
    const emotionalMemoryFlashLicensed =
      phase >= 2 && args.maxRevealRank >= REVEAL_TIER_RANK.fracture;

    const systemLockedSummary = [
      `${deep.displayName}：阶段${phase}（${sk.relinkStageLabels[phase - 1]}）`,
      surfaceRelationDominant ? "表层公寓职能主导" : deepEchoUnlocked ? "残响叙事已许可" : "",
      inOldLoop ? "旧阵槽位已激活（非全程跟队）" : "",
    ]
      .filter(Boolean)
      .join("；");

    const nextMechanicalHints: string[] = [];
    if (phase === 1) {
      nextMechanicalHints.push(...sk.publicNeedVector.slice(0, 2));
      nextMechanicalHints.push(`系统约束：${sk.antiInstantPartyReason.slice(0, 48)}…`);
    } else if (phase === 2 && !inOldLoop && sk.requiresXinlanPivotForPhase3 && !pivotOpen && !crisis) {
      nextMechanicalHints.push("抬升欣蓝好感或推进七锚/旧阵世界标记以打开牵引");
      nextMechanicalHints.push(sk.fallbackJoinPath.slice(0, 56));
    } else if (!inOldLoop) {
      nextMechanicalHints.push(...sk.permanentBondConditions.slice(0, 2));
    } else {
      nextMechanicalHints.push("阵线已对齐：叙事可并行行动，职能节点仍保留");
    }
    nextMechanicalHints.splice(3);

    const deepRevealUnlocksActive = deepRevealUnlocksForRank(sk, args.maxRevealRank);

    const tractionAttribution: PartyPhase3Traction | "none" =
      phase === 3 && phase3Traction ? phase3Traction : "none";

    entries.push({
      npcId: id,
      displayName: deep.displayName,
      relinkPhase: phase,
      phaseKey: phaseKeyFor(phase),
      relinkStageLabel: sk.relinkStageLabels[phase - 1],
      inOldLoop,
      surfaceRelationDominant,
      deepEchoUnlocked,
      mayAdvanceReveal,
      phase3Traction,
      systemLockedSummary,
      nextMechanicalHints,
      canEnterCoreParty,
      fractureRelationshipLineOpen,
      deepRelationshipLineOpen,
      mayTriggerTeamScopedTasks,
      emotionalMemoryFlashLicensed,
      closedLoopWeight: sk.closedLoopWeight,
      fractureHintStyle: sk.fractureHintStyle,
      deepRevealUnlocksActive,
      tractionAttribution,
    });
  }

  return entries;
}

export function buildMajorNpcRelinkPacket(args: {
  playerContext: string;
  signals: PlayerWorldSignals;
  nearbyNpcIds: string[];
  maxRevealRank: RevealTierRank;
}): MajorNpcRelinkPacket {
  const entries = computeMajorNpcRelinkStates(args);
  const xinlan = entries.find((e) => e.npcId === XINLAN_MAJOR_NPC_ID);
  const favorById = parseCodexFavorByNpcId(args.playerContext);
  const xinlanPivotOpen = computeXinlanPivotOpen({
    xinlanFavor: favorById[XINLAN_MAJOR_NPC_ID] ?? 0,
    maxRevealRank: args.maxRevealRank,
    worldFlags: args.signals.worldFlags,
  });
  return {
    schema: "major_npc_relink_v1",
    xinlanPivotOpen,
    crisisJoinWindowActive: computeCrisisJoinWindowActive(args.signals),
    xinlanRelinkPhase: xinlan?.relinkPhase ?? 1,
    entries,
  };
}

export function buildMajorNpcRelinkPacketCompact(packet: MajorNpcRelinkPacket): MajorNpcRelinkPacketCompact {
  return {
    schema: packet.schema,
    xinlanPivotOpen: packet.xinlanPivotOpen,
    crisisJoinWindowActive: packet.crisisJoinWindowActive,
    xinlanPh: packet.xinlanRelinkPhase,
    rows: packet.entries.map((e) => ({
      id: e.npcId,
      ph: e.relinkPhase,
      loop: e.inOldLoop,
      surf: e.surfaceRelationDominant,
      deep: e.deepEchoUnlocked,
      rev: e.mayAdvanceReveal,
      tr: e.phase3Traction ?? "—",
      party: e.canEnterCoreParty,
      team: e.mayTriggerTeamScopedTasks,
      mf: e.emotionalMemoryFlashLicensed,
      w: e.closedLoopWeight,
    })),
  };
}
