/**
 * 学制/循环/校源/高魅力 NPC 的 runtime JSON packet（按 maxRevealRank 强裁剪，防开局剧透）。
 * 与 schoolCycleCanon、majorNpcRelinkRegistry 共用信号；长文仍走 RAG/bootstrap。
 */

import {
  getMajorNpcDeepCanon,
  MAJOR_NPC_IDS,
  type MajorNpcId,
} from "@/lib/registry/majorNpcDeepCanon";
import type { MajorNpcRelinkPacket } from "@/lib/registry/majorNpcRelinkRegistry";
import { buildCycleLoopTimeDigest } from "@/lib/registry/cycleMoonFlashRegistry";
import { SCHOOL_CYCLE_LORE_SLICES } from "@/lib/registry/schoolCycleCanon";
import type { PlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import {
  REVEAL_TIER_RANK,
  revealTierIdFromRank,
  type RevealTierRank,
} from "@/lib/registry/revealTierRank";
import {
  majorNpcDutyEchoHint,
  majorNpcJoinVectorHint,
  majorNpcResidualEchoHint,
  majorNpcSchoolResidueHint,
  majorNpcSurfaceDutyOneLiner,
} from "@/lib/registry/majorNpcRuntimeHelpers";
import { clipPacketLine, RUNTIME_PACKET_ANTI_DUMP } from "@/lib/registry/runtimePacketStrings";

function sliceById(id: string) {
  return SCHOOL_CYCLE_LORE_SLICES.find((s) => s.id === id);
}

/** 附近高魅力 NPC：表层身份 + 分档深提示 + 重连信号（与 team_relink 分工：本包偏「是谁」） */
export function buildMajorNpcArcPacket(args: {
  nearbyNpcIds: string[];
  maxRevealRank: RevealTierRank;
  relinkEntries: MajorNpcRelinkPacket["entries"];
}): Record<string, unknown> {
  const relinkMap = new Map(args.relinkEntries.map((e) => [e.npcId, e]));
  const majorNearby = args.nearbyNpcIds
    .filter((id): id is MajorNpcId => MAJOR_NPC_IDS.includes(id as MajorNpcId))
    .slice(0, 4);

  const nearby = majorNearby.map((id) => {
    const m = getMajorNpcDeepCanon(id);
    if (!m) return null;
    const rel = relinkMap.get(id);
    const row: Record<string, unknown> = {
      id: m.id,
      displayName: m.displayName,
      surfaceIdentity: m.publicMaskRole,
      surfaceDutyOneLiner: majorNpcSurfaceDutyOneLiner(m.apartmentSurfaceDuty),
    };
    if (args.maxRevealRank >= REVEAL_TIER_RANK.fracture) {
      row.dutyEchoHint = majorNpcDutyEchoHint(m.apartmentSurfaceDuty);
    }
    if (args.maxRevealRank >= REVEAL_TIER_RANK.deep) {
      row.schoolResidueHint = majorNpcSchoolResidueHint(m.schoolIdentity);
      row.residualEchoHint = majorNpcResidualEchoHint(m.residualEchoToProtagonist);
    }
    if (args.maxRevealRank >= REVEAL_TIER_RANK.abyss) {
      row.joinVectorHint = majorNpcJoinVectorHint(m.joinVector);
    }
    if (rel && args.maxRevealRank >= REVEAL_TIER_RANK.fracture) {
      row.relinkSignals = {
        phase: rel.relinkPhase,
        stageLabel: rel.relinkStageLabel,
        deepEchoLicensed: rel.deepEchoUnlocked,
        loopPartiallyActive: rel.inOldLoop,
        dejaToneOk: rel.deepEchoUnlocked && args.maxRevealRank >= REVEAL_TIER_RANK.deep,
        corePartyOk: rel.canEnterCoreParty,
        teamTasksOk: rel.mayTriggerTeamScopedTasks,
        memoryFlashOk: rel.emotionalMemoryFlashLicensed,
        fractureLineOpen: rel.fractureRelationshipLineOpen,
        deepLineOpen: rel.deepRelationshipLineOpen,
        hintStyle: rel.fractureHintStyle,
        traction: rel.tractionAttribution,
      };
    }
    return row;
  }).filter(Boolean);

  const relRows = majorNearby.map((id) => relinkMap.get(id)).filter(Boolean);
  const signalAggregate = {
    anyLoopPartial: relRows.some((r) => r!.inOldLoop),
    anyDeepEchoLicensed: relRows.some((r) => r!.deepEchoUnlocked),
    anyTraction: relRows.some((r) => Boolean(r!.tractionAttribution?.trim())),
    anyFractureLineOpen: relRows.some((r) => r!.fractureRelationshipLineOpen),
  };

  return {
    schema: "major_npc_arc_v1",
    maxRevealRankInjected: args.maxRevealRank,
    revealTierAllowed: revealTierIdFromRank(args.maxRevealRank),
    nearbySignalAggregate: signalAggregate,
    nearby,
    antiDumpPolicy: RUNTIME_PACKET_ANTI_DUMP,
  };
}

/** 轮回/闪烁/龙月：可见层分段；fracture+ 可嵌 timeDigest（须传 signals，否则无位相数值以免胡编） */
export function buildCycleLoopPacket(
  maxRevealRank: RevealTierRank,
  signals?: PlayerWorldSignals | null
): Record<string, unknown> {
  const timeDigest =
    signals && maxRevealRank >= REVEAL_TIER_RANK.fracture ? buildCycleLoopTimeDigest(signals) : null;

  if (maxRevealRank < REVEAL_TIER_RANK.fracture) {
    const s = sliceById("rumor_yeliri_echo");
    return {
      schema: "cycle_loop_v1",
      maxRevealRankInjected: maxRevealRank,
      visibleBand: "rumor",
      hints: s ? [clipPacketLine(s.body, 118)] : [],
      timeDigest: null,
      antiDumpPolicy: RUNTIME_PACKET_ANTI_DUMP,
    };
  }
  if (maxRevealRank < REVEAL_TIER_RANK.deep) {
    const hints: string[] = [];
    const rumor = sliceById("rumor_yeliri_echo");
    const odd = sliceById("not_ordinary_wanderer_coupling");
    if (rumor) hints.push(clipPacketLine(rumor.body, 90));
    if (odd) hints.push(clipPacketLine(odd.body, 100));
    hints.push("第 3 日 0 时起环境节律可能收紧（可感知后果，根因此档不直述）。");
    return {
      schema: "cycle_loop_v1",
      maxRevealRankInjected: maxRevealRank,
      visibleBand: "rhythm",
      hints: hints.slice(0, 3),
      timeDigest,
      companionStructuredPacket: "cycle_time_packet",
      antiDumpPolicy: RUNTIME_PACKET_ANTI_DUMP,
    };
  }
  const td = sliceById("ten_day_recycle_narrative");
  const dm = sliceById("dragon_moon_calibration");
  const hints = [td?.body, dm?.body]
    .filter(Boolean)
    .map((b) => clipPacketLine(b!, 130));
  return {
    schema: "cycle_loop_v1",
    maxRevealRankInjected: maxRevealRank,
    visibleBand: "mechanism",
    hints,
    timeDigest,
    companionStructuredPacket: "cycle_time_packet",
    antiDumpPolicy: RUNTIME_PACKET_ANTI_DUMP,
  };
}

/** 校源线索：surface 不注入；fracture 起给传言+裂缝耦合；deep 起给泄露/徘徊者/七锚提纲 */
export function buildSchoolSourcePacket(maxRevealRank: RevealTierRank): Record<string, unknown> {
  if (maxRevealRank < REVEAL_TIER_RANK.fracture) {
    return {
      schema: "school_source_v1",
      injected: false,
      maxRevealRankInjected: maxRevealRank,
      topicIds: [] as string[],
      revealBand: "none",
      lines: [] as string[],
      antiDumpPolicy: RUNTIME_PACKET_ANTI_DUMP,
    };
  }
  const lines: string[] = [];
  const topicIds: string[] = [];
  const rumor = sliceById("rumor_yeliri_echo");
  const odd = sliceById("not_ordinary_wanderer_coupling");
  if (rumor) {
    topicIds.push(rumor.id);
    lines.push(`${rumor.title}：${clipPacketLine(rumor.body, 88)}`);
  }
  if (odd) {
    topicIds.push(odd.id);
    lines.push(`${odd.title}：${clipPacketLine(odd.body, 88)}`);
  }
  if (maxRevealRank >= REVEAL_TIER_RANK.deep) {
    for (const id of ["school_leak_apartment_shell", "school_wanderer_state", "seven_anchor_loop"] as const) {
      const sl = sliceById(id);
      if (sl) {
        topicIds.push(sl.id);
        lines.push(`${sl.title}：${clipPacketLine(sl.body, 96)}`);
      }
    }
  }
  if (maxRevealRank >= REVEAL_TIER_RANK.abyss) {
    const ab = sliceById("abyss_alignment");
    if (ab) {
      topicIds.push(ab.id);
      lines.push(`${ab.title}：${clipPacketLine(ab.body, 96)}`);
    }
  }
  return {
    schema: "school_source_v1",
    injected: true,
    maxRevealRankInjected: maxRevealRank,
    topicIds: topicIds.slice(0, 8),
    revealBand: maxRevealRank >= REVEAL_TIER_RANK.abyss ? "abyss" : maxRevealRank >= REVEAL_TIER_RANK.deep ? "deep" : "fracture",
    lines: lines.slice(0, 6),
    antiDumpPolicy: RUNTIME_PACKET_ANTI_DUMP,
  };
}

/** 旧闭环重连质感：仅邻近 NPC + 精简纹理（与 major_npc_relink_packet 互补，偏「关系态势」） */
export function buildTeamRelinkPacket(args: {
  majorNpcRelinkPacket: MajorNpcRelinkPacket;
  nearbyNpcIds: string[];
}): Record<string, unknown> {
  const nearby = new Set(args.nearbyNpcIds);
  const nearbyTextures = args.majorNpcRelinkPacket.entries
    .filter((e) => nearby.has(e.npcId))
    .map((e) => ({
      id: e.npcId,
      displayName: e.displayName,
      relinkPhase: e.relinkPhase,
      oldLoopPartial: e.inOldLoop,
      dutyEchoOn: e.deepEchoUnlocked,
      textureLine: clipPacketLine(e.systemLockedSummary, 90),
    }))
    .slice(0, 4);
  const allE = args.majorNpcRelinkPacket.entries;
  const aggregate = {
    oldLoopAny: allE.some((e) => e.inOldLoop),
    deepEchoAny: allE.some((e) => e.deepEchoUnlocked),
    fractureLineAny: allE.some((e) => e.fractureRelationshipLineOpen),
    deepLineAny: allE.some((e) => e.deepRelationshipLineOpen),
    corePartyGateAny: allE.some((e) => e.canEnterCoreParty),
  };
  return {
    schema: "team_relink_v1",
    xinlanPivotOpen: args.majorNpcRelinkPacket.xinlanPivotOpen,
    crisisJoinWindowActive: args.majorNpcRelinkPacket.crisisJoinWindowActive,
    xinlanRelinkPhase: args.majorNpcRelinkPacket.xinlanRelinkPhase,
    aggregate,
    nearbyTextures,
    note: "供叙事质感与关系压强；不等于全员跟队或 UI 队友状态。",
    antiDumpPolicy: RUNTIME_PACKET_ANTI_DUMP,
  };
}

export function buildMajorNpcArcPacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const nearby = (p.nearby as unknown[] | undefined)?.slice(0, 2) ?? [];
  const agg = p.nearbySignalAggregate as Record<string, unknown> | undefined;
  return {
    schema: p.schema,
    maxRevealRankInjected: p.maxRevealRankInjected,
    rt: p.revealTierAllowed,
    sg: agg
      ? {
          lp: agg.anyLoopPartial,
          de: agg.anyDeepEchoLicensed,
          tr: agg.anyTraction,
          fo: agg.anyFractureLineOpen,
        }
      : undefined,
    nearby: nearby.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id,
        d: r.displayName,
        s: r.surfaceIdentity,
        sd: r.surfaceDutyOneLiner,
        ...(r.dutyEchoHint ? { du: r.dutyEchoHint } : {}),
        ...(r.relinkSignals ? { rs: r.relinkSignals } : {}),
      };
    }),
  };
}

export function buildCycleLoopPacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const hints = (p.hints as string[] | undefined) ?? [];
  const td = p.timeDigest as Record<string, unknown> | null | undefined;
  return {
    schema: p.schema,
    band: p.visibleBand,
    h: hints.slice(0, 1),
    ...(td ? { td } : {}),
  };
}

export function buildSchoolSourcePacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const lines = (p.lines as string[] | undefined) ?? [];
  const topicIds = (p.topicIds as string[] | undefined) ?? [];
  return {
    schema: p.schema,
    inj: p.injected,
    rb: p.revealBand,
    tid: topicIds.slice(0, 4),
    L: lines.slice(0, 2),
  };
}

export function buildTeamRelinkPacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const t = (p.nearbyTextures as unknown[] | undefined) ?? [];
  const ag = p.aggregate as Record<string, unknown> | undefined;
  return {
    schema: p.schema,
    x: p.xinlanPivotOpen,
    cr: p.crisisJoinWindowActive,
    ag: ag
      ? {
          lo: ag.oldLoopAny,
          de: ag.deepEchoAny,
          fo: ag.fractureLineAny,
          dL: ag.deepLineAny,
          cp: ag.corePartyGateAny,
        }
      : undefined,
    t: t.slice(0, 2).map((x) => {
      const r = x as Record<string, unknown>;
      return { id: r.id, ph: r.relinkPhase, lp: r.oldLoopPartial };
    }),
  };
}
