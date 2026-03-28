/**
 * 十日纠错、龙月校准、闪烁、锚点重构 — 单一闭环 registry。
 * 供 packet / RAG（coreCanonMapping）/ 纯函数派生消费；不替代客户端昼夜推进，只解释与对齐。
 */

import { getMajorNpcDeepCanon, MAJOR_NPC_IDS, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import type { PlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";

/** 叙事固定起点：学校侧泄露为泡层锚定的因，公寓侧为果（与 rootCanon 一致）。 */
export const SCHOOL_INCIDENT_ORIGIN_ID = "yeliri_school_first_spatial_leak" as const;

/** 封闭窗口长度（与玩法「约十日纠错」对齐；日历日可大于 10，位相仍按模回折）。 */
export const CYCLE_WINDOW_DAYS = 10;

/** 与 STABLE_MECHANISM_ANCHORS 一致：第 3 日 0 时起进入游戏内暗月/校准相位。 */
export const CALIBRATION_START_DAY = 3;

export const CYCLE_PHASE_KEYS = [
  "quiescence",
  "calibration",
  "precursor",
  "correction_window",
] as const;

export type CyclePhaseKey = (typeof CYCLE_PHASE_KEYS)[number];

export const MOON_SEMANTIC_KEYS = [
  "baseline_scheduling",
  "dragon_moon_calibration",
  "bandwidth_tighten",
  "correction_coupled_flash",
] as const;

export type MoonSemanticKey = (typeof MOON_SEMANTIC_KEYS)[number];

/** 闪烁前兆四条体验轴（环境 / 角色 / 楼层 / 叙事）。 */
export const FLASH_PRECURSOR_CHANNELS = {
  environment: {
    id: "precursor_environment",
    summary: "光色、声底噪、配电与排污节律出现不可归因的同步偏移；B1 迟滞带相对「更稳」，反差被放大。",
  },
  character: {
    id: "precursor_character",
    summary: "高共鸣个体出现短暂失语、重复性小动作或情绪闪回；欣蓝轴更易出现「未发生之事的情绪余震」。",
  },
  floor: {
    id: "precursor_floor",
    summary: "楼梯转角、门牌与走廊景深偶发错位感；威胁条未变时仍可能有「走错片场」的体感动画级暗示。",
  },
  narrative: {
    id: "precursor_narrative",
    summary: "任务描述、留言与广播出现轻微措辞漂移；同一 NPC 对同一事件给出不兼容版本之一瞬。",
  },
} as const;

/** 闪烁三段：前兆 → 过程（纠错执行）→ 结果（分支回收与回写）。 */
export const FLASH_PIPELINE = {
  precursor: "第 7–8 日位相：泡层提高纠错灵敏度，前兆四轴可并行抬升。",
  process: "第 9 日起：执行型闪烁（非纯特效），对不可收敛轮次做裁剪与重绑。",
  outcome:
    "第 10 日/窗口缘：失败结果被校准回收，主拓扑回写至最近稳定锚；非「同一剧本重演」，而是上一轮误差被没收。",
} as const;

/** 锚点重构语义（与 revive 链路咬合，非免费回档）。 */
export const ANCHOR_REBUILD_SEMANTICS = {
  topology_rewrite: "回写最近稳定拓扑（回声体—锚点契约），不是无来源的平行自我替换。",
  time_advance: "默认伴随类 12h 级时间推进叙事，禁止「零秒读档」。",
  cost_release: "携带负荷、物资与部分关系压强按规则释放或折算，表现为掉落、任务刷新或局势改写。",
  situation_rewrite: "楼内僵局可被秩序节点重新定价（任务/原石/威胁相位），与纠错窗口可叠乘但不同一指令。",
} as const;

/** 失败轮次在泡层内留下的可叙事痕迹类型（供任务/场景引用 id）。 */
export const FAILURE_CYCLE_TRACE_KINDS = [
  "residual_echo",
  "score_mark",
  "stale_note",
  "misplaced_item",
  "relation_mismatch",
] as const;

export type FailureCycleTraceKind = (typeof FAILURE_CYCLE_TRACE_KINDS)[number];

export const FAILURE_TRACE_LABELS: Record<FailureCycleTraceKind, string> = {
  residual_echo: "残响：声音/动作片段无因复现。",
  score_mark: "刻痕：墙体、家具或记录介质上出现非玩家制造的记号链。",
  stale_note: "旧笔记：日期或署名与当前轮次不一致的纸片/电子残片。",
  misplaced_item: "错位物品：应属于上一失败分支的物件出现在本分支。",
  relation_mismatch: "错位关系反应：NPC 短暂采用未解锁的好感或敌意口径。",
};

/** 失败轮次回收（cleanup）— 与「闪烁结果」同一闭环内的系统侧描述。 */
export const FAILURE_CYCLE_CLEANUP_SEMANTICS = {
  branch_prune: "不可收敛叙事枝被泡层规则剪除，不保留为平行 canon。",
  residue_policy: "允许保留受控痕迹（见 FAILURE_CYCLE_TRACE_KINDS），用于玩家推理，不得推翻根真相。",
  reconcile_with_revive: "玩家主动锚点重构是另一条回写路径；与窗口末纠错共享「回写/代价」语义，触发条件不同。",
} as const;

export const MEMORY_RETENTION_MODES = {
  protagonist: {
    id: "protagonist_memory_fragment",
    category: "memory_fragment_echo",
    summary: "主锚偏记忆残片型：空间边界、锚点步态与关键抉择可跨轮残留，对话级细节可被系统磨掉。",
  },
  xinlan: {
    id: "xinlan_emotion_fragment",
    category: "emotion_fragment",
    npcId: "N-010" as const,
    summary: "欣蓝偏情感残片型：时间顺序与专名弱，情绪与仪式记忆强，易触发「未竟之痛」式闪回。",
  },
  other_major_default: {
    id: "major_npc_deja_conditional",
    category: "deja_conditional",
    summary: "其余辅锚偏既视感/条件触发型：在指定任务、地点或好感阈值下解锁块记忆，平时表现为程序性熟练与违和。",
  },
} as const;

export type TimeMemoryCategory = "memory_fragment_echo" | "emotion_fragment" | "deja_conditional";

export function positionInDecade(day: number): number {
  const d = Math.max(1, Math.floor(day));
  return ((d - 1) % CYCLE_WINDOW_DAYS) + 1;
}

/** 第 3 日起进入校准相位（与全局「第3日0时起暗月」同口径，按日历日判定）；位相 6+ 带宽收紧，9+ 与纠错窗口强耦合。 */
export function moonSemanticForSignalsResolved(day: number, _hour: number): MoonSemanticKey {
  if (day < CALIBRATION_START_DAY) {
    return "baseline_scheduling";
  }
  const pos = positionInDecade(day);
  if (pos >= 9) return "correction_coupled_flash";
  if (pos >= 6) return "bandwidth_tighten";
  return "dragon_moon_calibration";
}

export function cyclePhaseForPosition(pos: number): CyclePhaseKey {
  if (pos <= 2) return "quiescence";
  if (pos <= 6) return "calibration";
  if (pos <= 8) return "precursor";
  return "correction_window";
}

export type FlashProximity = "none" | "precursor_band" | "imminent";

export function flashProximityForPosition(pos: number): FlashProximity {
  if (pos <= 6) return "none";
  if (pos <= 8) return "precursor_band";
  return "imminent";
}

export interface CycleTimeComputed {
  calendarDay: number;
  gameHour: number;
  positionInDecade: number;
  cyclePhase: CyclePhaseKey;
  moonSemantic: MoonSemanticKey;
  flashProximity: FlashProximity;
  precursorPhaseActive: boolean;
  nearFlashPressure: boolean;
  anchorRebuiltThisCycle: boolean;
}

export function computeCycleTimeState(signals: PlayerWorldSignals): CycleTimeComputed {
  const calendarDay = signals.day;
  const gameHour = signals.hour;
  const decadePosition = positionInDecade(calendarDay);
  const moonSemantic = moonSemanticForSignalsResolved(calendarDay, gameHour);
  const cyclePhase = cyclePhaseForPosition(decadePosition);
  const flashProximity = flashProximityForPosition(decadePosition);
  const precursorPhaseActive = cyclePhase === "precursor";
  const nearFlashPressure = flashProximity !== "none";
  return {
    calendarDay,
    gameHour,
    positionInDecade: decadePosition,
    cyclePhase,
    moonSemantic,
    flashProximity,
    precursorPhaseActive,
    nearFlashPressure,
    anchorRebuiltThisCycle: signals.anchorRebuiltThisCycle,
  };
}

/**
 * 嵌进 cycle_loop_packet 的极薄位相片（短键名控体积；完整字段见 cycle_time_packet）。
 * fracture+ 且传入 signals 时由 buildCycleLoopPacket 附加。
 */
export function buildCycleLoopTimeDigest(signals: PlayerWorldSignals): {
  pos: number;
  phase: CyclePhaseKey;
  moon: MoonSemanticKey;
  fp: FlashProximity;
  pre: boolean;
  rt: boolean;
} {
  const st = computeCycleTimeState(signals);
  return {
    pos: st.positionInDecade,
    phase: st.cyclePhase,
    moon: st.moonSemantic,
    fp: st.flashProximity,
    pre: st.precursorPhaseActive,
    rt: st.calendarDay >= CALIBRATION_START_DAY,
  };
}

function majorNpcTimeMemoryCategory(id: string): TimeMemoryCategory | null {
  if (!MAJOR_NPC_IDS.includes(id as MajorNpcId)) return null;
  return id === MEMORY_RETENTION_MODES.xinlan.npcId ? "emotion_fragment" : "deja_conditional";
}

export function buildNearbyMajorNpcTimeMemoryRows(
  nearbyMajorNpcIds: readonly string[],
  maxRevealRank: RevealTierRank
): Array<{ npcId: string; timeMemoryCategory: TimeMemoryCategory; retentionHint: string | null }> {
  if (maxRevealRank < REVEAL_TIER_RANK.deep) return [];
  const rows: Array<{ npcId: string; timeMemoryCategory: TimeMemoryCategory; retentionHint: string | null }> = [];
  for (const id of nearbyMajorNpcIds) {
    const cat = majorNpcTimeMemoryCategory(id);
    if (!cat) continue;
    const deep = getMajorNpcDeepCanon(id as MajorNpcId);
    const retentionHint =
      deep && deep.memoryRetentionMode.length > 0
        ? deep.memoryRetentionMode.length > 72
          ? `${deep.memoryRetentionMode.slice(0, 69)}…`
          : deep.memoryRetentionMode
        : null;
    rows.push({ npcId: id, timeMemoryCategory: cat, retentionHint });
  }
  return rows.slice(0, 6);
}

export function buildCycleTimePacket(args: {
  signals: PlayerWorldSignals;
  nearbyMajorNpcIds: readonly string[];
  maxRevealRank: RevealTierRank;
}): Record<string, unknown> {
  const st = computeCycleTimeState(args.signals);
  const base: Record<string, unknown> = {
    schema: "cycle_time_v1",
    maxRevealRankInjected: args.maxRevealRank,
    calendarDay: st.calendarDay,
    gameHour: st.gameHour,
    closedLoopNote:
      args.maxRevealRank >= REVEAL_TIER_RANK.deep
        ? "单一闭环：学校侧泄露为因 → 泡层十日窗口纠错为果；龙月=外置校准面；闪烁=执行回收；锚点重构=付费回写分支。"
        : null,
  };

  if (args.maxRevealRank < REVEAL_TIER_RANK.fracture) {
    return {
      ...base,
      band: "surface",
      rhythmTightens: st.calendarDay >= CALIBRATION_START_DAY ? true : null,
    };
  }

  const precursorChannels =
    st.precursorPhaseActive || st.flashProximity === "imminent"
      ? {
          environment: FLASH_PRECURSOR_CHANNELS.environment.summary,
          character: FLASH_PRECURSOR_CHANNELS.character.summary,
          floor: FLASH_PRECURSOR_CHANNELS.floor.summary,
          narrative: FLASH_PRECURSOR_CHANNELS.narrative.summary,
        }
      : null;

  if (args.maxRevealRank < REVEAL_TIER_RANK.deep) {
    return {
      ...base,
      band: "fracture",
      positionInDecade: st.positionInDecade,
      cyclePhase: st.cyclePhase,
      flashProximity: st.flashProximity,
      precursorPhaseActive: st.precursorPhaseActive,
      nearFlashPressure: st.nearFlashPressure,
      anchorRebuiltThisCycle: st.anchorRebuiltThisCycle,
      protagonistTimeExperience: MEMORY_RETENTION_MODES.protagonist.category,
      precursorChannels,
    };
  }

  return {
    ...base,
    band: "mechanism",
    positionInDecade: st.positionInDecade,
    cyclePhase: st.cyclePhase,
    moonSemanticKey: st.moonSemantic,
    flashProximity: st.flashProximity,
    precursorPhaseActive: st.precursorPhaseActive,
    nearFlashPressure: st.nearFlashPressure,
    anchorRebuiltThisCycle: st.anchorRebuiltThisCycle,
    flashPipeline: FLASH_PIPELINE,
    precursorChannels,
    anchorRebuildSemantics: ANCHOR_REBUILD_SEMANTICS,
    failureCleanupSemantics: FAILURE_CYCLE_CLEANUP_SEMANTICS,
    failureTraceKinds: [...FAILURE_CYCLE_TRACE_KINDS],
    failureTraceLabels: FAILURE_TRACE_LABELS,
    protagonistTimeExperience: MEMORY_RETENTION_MODES.protagonist,
    npcTimeMemoryNearby: buildNearbyMajorNpcTimeMemoryRows(args.nearbyMajorNpcIds, args.maxRevealRank),
    schoolIncidentOriginId: SCHOOL_INCIDENT_ORIGIN_ID,
  };
}

export function buildCycleTimePacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    schema: p.schema,
    b: p.band,
    d: p.calendarDay,
  };
  if (p.gameHour !== undefined) out.h = p.gameHour;
  if (p.positionInDecade !== undefined) out.pos = p.positionInDecade;
  if (p.cyclePhase !== undefined) out.ph = p.cyclePhase;
  if (p.flashProximity !== undefined) out.fp = p.flashProximity;
  if (p.precursorPhaseActive !== undefined) out.pre = p.precursorPhaseActive;
  if (p.nearFlashPressure !== undefined) out.nfp = p.nearFlashPressure;
  if (p.anchorRebuiltThisCycle !== undefined) out.arb = p.anchorRebuiltThisCycle;
  if (p.moonSemanticKey !== undefined) out.moon = p.moonSemanticKey;
  if (p.rhythmTightens !== undefined && p.rhythmTightens !== null) out.rt = p.rhythmTightens;
  return out;
}

/** RAG / coreCanon：结构化事实（带 reveal 标签，偏 deep）。 */
export function buildCycleMoonFlashFactsForCanon(): Array<{
  factKey: string;
  canonicalText: string;
  tags: string[];
}> {
  const tagsBase = ["cycle_moon_flash", "school_cycle", "time_loop", "reveal_deep"];
  return [
    {
      factKey: "cycle_moon:unified_closed_loop",
      canonicalText: [
        "【时间闭环总链】耶里学校侧空间碎片泄露为确定起点；如月公寓泡层进入约十日封闭纠错窗口。",
        "每一轮窗口不是同一剧本重演：失败分支被校准回收，允许受控痕迹（残响/刻痕/旧笔记/错位物品/错位关系反应）。",
        "龙月（月亮）为龙之外置魔力调度面，向泡层提供校准辐照；第3日0时起游戏内暗月阶段对应校准相位偏移，威胁抬升为可观测后果。",
        "闪烁具备前兆（四轴）—过程（执行纠错）—结果（回收与拓扑回写）；锚点重构为另一条回写路径，伴随时间推进、代价释放与局势改写。",
      ].join(""),
      tags: tagsBase,
    },
    {
      factKey: "cycle_moon:cycle_phases",
      canonicalText: `【位相】quiescence(位相1–2)/calibration(3–6)/precursor(7–8)/correction_window(9–10)；与日历日取模 ${CYCLE_WINDOW_DAYS} 对齐。`,
      tags: tagsBase,
    },
    {
      factKey: "cycle_moon:moon_semantics",
      canonicalText: `【月相语义】${MOON_SEMANTIC_KEYS.join(" → ")}：自校准激活起带宽收紧，至纠错窗口与闪烁强耦合。`,
      tags: tagsBase,
    },
    {
      factKey: "cycle_moon:flash_precursors",
      canonicalText: Object.values(FLASH_PRECURSOR_CHANNELS)
        .map((c) => `【${c.id}】${c.summary}`)
        .join(""),
      tags: tagsBase,
    },
    {
      factKey: "cycle_moon:anchor_rebuild",
      canonicalText: Object.entries(ANCHOR_REBUILD_SEMANTICS)
        .map(([k, v]) => `【${k}】${v}`)
        .join(""),
      tags: tagsBase,
    },
    {
      factKey: "cycle_moon:memory_retention",
      canonicalText: [
        MEMORY_RETENTION_MODES.protagonist.summary,
        MEMORY_RETENTION_MODES.xinlan.summary,
        MEMORY_RETENTION_MODES.other_major_default.summary,
      ].join(""),
      tags: tagsBase,
    },
    {
      factKey: "cycle_moon:failure_cleanup",
      canonicalText: Object.values(FAILURE_CYCLE_CLEANUP_SEMANTICS).join(""),
      tags: tagsBase,
    },
  ];
}
