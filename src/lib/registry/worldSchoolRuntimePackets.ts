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
import { SCHOOL_CYCLE_LORE_SLICES } from "@/lib/registry/schoolCycleCanon";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";

function sliceById(id: string) {
  return SCHOOL_CYCLE_LORE_SLICES.find((s) => s.id === id);
}

const ANTI_DUMP = "即使玩家追问，亦须分步交付；本包为预算上限，非一次性必答清单。";

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
    };
    if (args.maxRevealRank >= REVEAL_TIER_RANK.fracture) {
      row.dutyEchoHint = m.apartmentSurfaceDuty.length > 100 ? `${m.apartmentSurfaceDuty.slice(0, 97)}…` : m.apartmentSurfaceDuty;
    }
    if (args.maxRevealRank >= REVEAL_TIER_RANK.deep) {
      row.schoolResidueHint =
        m.schoolIdentity.length > 88 ? `${m.schoolIdentity.slice(0, 85)}…` : m.schoolIdentity;
      row.residualEchoHint =
        m.residualEchoToProtagonist.length > 72 ? `${m.residualEchoToProtagonist.slice(0, 69)}…` : m.residualEchoToProtagonist;
    }
    if (args.maxRevealRank >= REVEAL_TIER_RANK.abyss) {
      row.joinVectorHint = m.joinVector.length > 80 ? `${m.joinVector.slice(0, 77)}…` : m.joinVector;
    }
    if (rel && args.maxRevealRank >= REVEAL_TIER_RANK.fracture) {
      row.relinkSignals = {
        phase: rel.relinkPhase,
        deepEchoLicensed: rel.deepEchoUnlocked,
        loopPartiallyActive: rel.inOldLoop,
        dejaToneOk: rel.deepEchoUnlocked && args.maxRevealRank >= REVEAL_TIER_RANK.deep,
      };
    }
    return row;
  }).filter(Boolean);

  return {
    schema: "major_npc_arc_v1",
    maxRevealRankInjected: args.maxRevealRank,
    nearby,
    antiDumpPolicy: ANTI_DUMP,
  };
}

/** 轮回/闪烁/龙月：可见层分段，深层机制仅在 deep+ */
export function buildCycleLoopPacket(maxRevealRank: RevealTierRank): Record<string, unknown> {
  if (maxRevealRank < REVEAL_TIER_RANK.fracture) {
    const s = sliceById("rumor_yeliri_echo");
    return {
      schema: "cycle_loop_v1",
      maxRevealRankInjected: maxRevealRank,
      visibleBand: "rumor",
      hints: s ? [s.body.length > 118 ? `${s.body.slice(0, 115)}…` : s.body] : [],
      antiDumpPolicy: ANTI_DUMP,
    };
  }
  if (maxRevealRank < REVEAL_TIER_RANK.deep) {
    const hints: string[] = [];
    const rumor = sliceById("rumor_yeliri_echo");
    const odd = sliceById("not_ordinary_wanderer_coupling");
    if (rumor) hints.push(rumor.body.length > 90 ? `${rumor.body.slice(0, 87)}…` : rumor.body);
    if (odd) hints.push(odd.body.length > 100 ? `${odd.body.slice(0, 97)}…` : odd.body);
    hints.push("第 3 日 0 时起环境节律可能收紧（可感知后果，根因此档不直述）。");
    return {
      schema: "cycle_loop_v1",
      maxRevealRankInjected: maxRevealRank,
      visibleBand: "rhythm",
      hints: hints.slice(0, 3),
      antiDumpPolicy: ANTI_DUMP,
    };
  }
  const td = sliceById("ten_day_recycle_narrative");
  const dm = sliceById("dragon_moon_calibration");
  const hints = [td?.body, dm?.body]
    .filter(Boolean)
    .map((b) => (b!.length > 130 ? `${b!.slice(0, 127)}…` : b!));
  return {
    schema: "cycle_loop_v1",
    maxRevealRankInjected: maxRevealRank,
    visibleBand: "mechanism",
    hints,
    antiDumpPolicy: ANTI_DUMP,
  };
}

/** 校源线索：surface 不注入；fracture 起给传言+裂缝耦合；deep 起给泄露/徘徊者/七锚提纲 */
export function buildSchoolSourcePacket(maxRevealRank: RevealTierRank): Record<string, unknown> {
  if (maxRevealRank < REVEAL_TIER_RANK.fracture) {
    return {
      schema: "school_source_v1",
      injected: false,
      maxRevealRankInjected: maxRevealRank,
      lines: [] as string[],
      antiDumpPolicy: ANTI_DUMP,
    };
  }
  const lines: string[] = [];
  const rumor = sliceById("rumor_yeliri_echo");
  const odd = sliceById("not_ordinary_wanderer_coupling");
  if (rumor) lines.push(`${rumor.title}：${rumor.body.slice(0, 88)}…`);
  if (odd) lines.push(`${odd.title}：${odd.body.slice(0, 88)}…`);
  if (maxRevealRank >= REVEAL_TIER_RANK.deep) {
    for (const id of ["school_leak_apartment_shell", "school_wanderer_state", "seven_anchor_loop"] as const) {
      const sl = sliceById(id);
      if (sl) lines.push(`${sl.title}：${sl.body.slice(0, 96)}…`);
    }
  }
  if (maxRevealRank >= REVEAL_TIER_RANK.abyss) {
    const ab = sliceById("abyss_alignment");
    if (ab) lines.push(`${ab.title}：${ab.body.slice(0, 96)}…`);
  }
  return {
    schema: "school_source_v1",
    injected: true,
    maxRevealRankInjected: maxRevealRank,
    lines: lines.slice(0, 6),
    antiDumpPolicy: ANTI_DUMP,
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
      textureLine: e.systemLockedSummary.length > 90 ? `${e.systemLockedSummary.slice(0, 87)}…` : e.systemLockedSummary,
    }))
    .slice(0, 4);
  return {
    schema: "team_relink_v1",
    xinlanPivotOpen: args.majorNpcRelinkPacket.xinlanPivotOpen,
    crisisJoinWindowActive: args.majorNpcRelinkPacket.crisisJoinWindowActive,
    xinlanRelinkPhase: args.majorNpcRelinkPacket.xinlanRelinkPhase,
    nearbyTextures,
    note: "供叙事质感与关系压强；不等于全员跟队或 UI 队友状态。",
    antiDumpPolicy: ANTI_DUMP,
  };
}

export function buildMajorNpcArcPacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const nearby = (p.nearby as unknown[] | undefined)?.slice(0, 2) ?? [];
  return {
    schema: p.schema,
    maxRevealRankInjected: p.maxRevealRankInjected,
    nearby: nearby.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id,
        d: r.displayName,
        s: r.surfaceIdentity,
        ...(r.dutyEchoHint ? { du: r.dutyEchoHint } : {}),
        ...(r.relinkSignals ? { rs: r.relinkSignals } : {}),
      };
    }),
  };
}

export function buildCycleLoopPacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const hints = (p.hints as string[] | undefined) ?? [];
  return {
    schema: p.schema,
    band: p.visibleBand,
    h: hints.slice(0, 1),
  };
}

export function buildSchoolSourcePacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const lines = (p.lines as string[] | undefined) ?? [];
  return {
    schema: p.schema,
    inj: p.injected,
    L: lines.slice(0, 2),
  };
}

export function buildTeamRelinkPacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const t = (p.nearbyTextures as unknown[] | undefined) ?? [];
  return {
    schema: p.schema,
    x: p.xinlanPivotOpen,
    cr: p.crisisJoinWindowActive,
    t: t.slice(0, 2).map((x) => {
      const r = x as Record<string, unknown>;
      return { id: r.id, ph: r.relinkPhase, lp: r.oldLoopPartial };
    }),
  };
}
