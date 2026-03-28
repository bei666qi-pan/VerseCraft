/**
 * 学制循环·玩家体验层：残响证据、关系残留感知、失败携带增益（元）、前兆模板、高魅力主动推剧情钩。
 * 供 packet / RAG / 任务 id 引用；不大改 UI，服务端可用 worldFlags `xp.*` / `cycle_residue.*` 点亮子集。
 */

import {
  FAILURE_CYCLE_TRACE_KINDS,
  FAILURE_TRACE_LABELS,
  type FailureCycleTraceKind,
  computeCycleTimeState,
} from "@/lib/registry/cycleMoonFlashRegistry";
import { MAJOR_NPC_IDS, getMajorNpcDeepCanon, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import type { PlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";

/** 玩家可见「旧轮证据」通道（与 FAILURE_CYCLE_TRACE_KINDS 对齐并可扩展任务道具） */
export const RESIDUAL_EVIDENCE_CHANNELS: readonly {
  traceKind: FailureCycleTraceKind;
  playerFacingId: string;
  shortLabel: string;
  narrativeBudget: string;
  /** 后续可绑任务/物品；本轮仅 id 预留 */
  suggestedTaskHook: string;
}[] = [
  {
    traceKind: "residual_echo",
    playerFacingId: "evidence_echo_handbook",
    shortLabel: "残响手记感",
    narrativeBudget: "非本人笔迹的短句、在错误页缘出现又消失；可推为旧轮情绪残渣。",
    suggestedTaskHook: "task:xp.echo_handbook_fragment",
  },
  {
    traceKind: "stale_note",
    playerFacingId: "evidence_misplaced_log",
    shortLabel: "错位记录",
    narrativeBudget: "日期/署名与当前日序不符的便签或登记残片；适合给推理锚点而非直接答案。",
    suggestedTaskHook: "task:xp.misplaced_log",
  },
  {
    traceKind: "score_mark",
    playerFacingId: "evidence_score_mark",
    shortLabel: "刻痕链",
    narrativeBudget: "墙沿、扶手或配电箱盖上重复记号；可导向「有人标过安全/危险动线」。",
    suggestedTaskHook: "task:xp.score_mark_chain",
  },
  {
    traceKind: "misplaced_item",
    playerFacingId: "evidence_misplaced_item",
    shortLabel: "错位物",
    narrativeBudget: "不应在此分支出现的随身小物；换取资源或换线索，不做无代价神装。",
    suggestedTaskHook: "task:xp.misplaced_item_turn_in",
  },
  {
    traceKind: "relation_mismatch",
    playerFacingId: "evidence_relation_glitch",
    shortLabel: "关系闪断",
    narrativeBudget: "NPC 一两句用过期好感/敌意口吻又立刻收回；情绪抓手，非数值继承。",
    suggestedTaskHook: "task:xp.relation_glitch_scene",
  },
] as const;

/** 旧闭环残留感知（非好感继承） */
export const RELINK_RESIDUE_PERCEPTION_MODES = {
  familiarity_wrongness: {
    id: "familiarity_wrongness",
    summary: "熟悉但说不清的错位：认得步频、不认得理由。",
  },
  dream_bleed: {
    id: "dream_bleed",
    summary: "梦境/半醒片段混入当下感官，醒来无法复述全句。",
  },
  somatic_reflex: {
    id: "somatic_reflex",
    summary: "身体先于大脑：遇某拐角自动停步、捂耳、握空拳。",
  },
  deferred_guilt: {
    id: "deferred_guilt",
    summary: "对某 NPC 无端亏欠感，尚无事件支撑，适合驱动主动接近。",
  },
} as const;

export type FailureCarryoverCategory = "cognitive" | "route" | "relationship" | "clue";

export interface FailureCarryoverMetaEntry {
  id: string;
  category: FailureCarryoverCategory;
  title: string;
  playerValueLine: string;
  /** packet_ready：本包可提示；data_reserved：仅文档与后续任务用 */
  implementationStatus: "packet_ready" | "data_reserved";
  suggestedTaskHook: string;
}

/** 失败轮次「永久增益」元数据（叙事/认知向，非战力直加） */
export const FAILURE_CARRYOVER_META: readonly FailureCarryoverMetaEntry[] = [
  {
    id: "xp.carryover.route_shortcut_memory",
    category: "route",
    title: "路线型：捷径记忆残片",
    playerValueLine: "记得某段楼梯少踩一格更稳，但说不清谁教的；可缩风险窗口叙事。",
    implementationStatus: "packet_ready",
    suggestedTaskHook: "task:xp.route_echo_unlock",
  },
  {
    id: "xp.carryover.cognitive_anomaly_tag",
    category: "cognitive",
    title: "认知型：诡异标签固化",
    playerValueLine: "上一失败轮认准的主威胁习性残留一句「它怕什么节奏」；须与 main_threat_packet 对齐才可落盘。",
    implementationStatus: "data_reserved",
    suggestedTaskHook: "task:xp.cognitive_threat_tag",
  },
  {
    id: "xp.carryover.relationship_debt_echo",
    category: "relationship",
    title: "关系型：人情债回声",
    playerValueLine: "非数值继承：某 NPC 对你「像欠过一次」的口气；驱动对话与任务而非直接满好感。",
    implementationStatus: "packet_ready",
    suggestedTaskHook: "task:xp.debt_echo_dialogue",
  },
  {
    id: "xp.carryover.clue_pin_board",
    category: "clue",
    title: "线索型：钉板线索保留",
    playerValueLine: "纠错后仍留一条可验证物证指向（门牌/广播频段）；防纯谜语，给下一环具体抓手。",
    implementationStatus: "data_reserved",
    suggestedTaskHook: "task:xp.clue_pin_board",
  },
];

/** 闪烁将至：环境 / 六人轴心反应 / 普通人误读 */
export interface PrecursorExperienceTemplate {
  id: string;
  flashBand: "precursor_band" | "imminent";
  envLine: string;
  /** 按 teamBridgeRole 给一句，供 DM 选用 */
  sixAxisReactions: Record<string, string>;
  mundaneNpcMisread: string;
}

export const PRECURSOR_EXPERIENCE_TEMPLATES: readonly PrecursorExperienceTemplate[] = [
  {
    id: "precursor_template_A",
    flashBand: "precursor_band",
    envLine: "灯色偏青一瞬、电梯到达音叠半拍；B1 相对更「静」，反差让人想赖着不走。",
    sixAxisReactions: {
      boundary_steward: "停步检查砖缝，像等一个没来的人。",
      humanity_buffer: "笑一半卡住，下意识去摸不存在的话筒线。",
      first_relink_pivot: "念名字念到一半改口成房号。",
      exchange_router: "报价前停顿，像记得你已还过一次价。",
      induction_edge: "把画笔转半圈又放回——纸上有未干的陌生折角。",
      mirror_counterweight: "照镜子时间多了一秒，说「今天妆不对」却未上妆。",
    },
    mundaneNpcMisread: "普通住户嘟囔物业又调灯、或怪自己熬夜；可给喜剧缓冲，不得解构主威胁规则。",
  },
  {
    id: "precursor_template_B",
    flashBand: "imminent",
    envLine: "走廊景深拉伸半米、门牌数字在视野边缘抖一下；主威胁 UI 未变也可写「空气变涩」。",
    sixAxisReactions: {
      boundary_steward: "直接挡在你与楼梯之间，不言谢，只说一句「别踩第三格」。",
      humanity_buffer: "抓住你袖口又松开，说「别在这层答应任何事」。",
      first_relink_pivot: "名单纸边被汗湿，仍撕下一角塞给你——上面是空白。",
      exchange_router: "把交易单翻面：背面有旧水渍形成的陌生符号。",
      induction_edge: "素描本上出现你从未摆过的姿势线稿。",
      mirror_counterweight: "低声说「别看电梯镜面」，自己却在看。",
    },
    mundaneNpcMisread: "住户骂信号差、小孩说楼在「重播」；保持可怖与日常并存，勿让路人讲出七锚术语。",
  },
];

/** 高魅力 NPC 主动推剧情：仅提示「可发起」与任务钩，选择权仍在玩家 */
export const MAJOR_NPC_PROACTIVE_HOOKS: Record<
  MajorNpcId,
  { initiativeBand: "observe" | "nudge" | "intercept"; hookIds: readonly string[]; dmOneLiner: string }
> = {
  "N-015": {
    initiativeBand: "intercept",
    hookIds: ["xp.npc.n015.border_ping", "task:border.watch.log"],
    dmOneLiner: "可主动以「封线检查」为由改你动线，逼你在安全与捷径间选。",
  },
  "N-020": {
    initiativeBand: "nudge",
    hookIds: ["xp.npc.n020.supply_whisper", "task:b1.supply.route"],
    dmOneLiner: "可塞给你多一张「别人退掉的」补给条，附带半句警告。",
  },
  "N-010": {
    initiativeBand: "nudge",
    hookIds: ["xp.npc.xinlan.list_ping", "task:registry.list_fragment"],
    dmOneLiner: "可主动递登记笔又抽回，用名单空白牵引你发问，不代选答案。",
  },
  "N-018": {
    initiativeBand: "observe",
    hookIds: ["xp.npc.n018.exchange_probe", "task:merchant.echo_offer"],
    dmOneLiner: "可抢先报价「你上次欠的那种」制造错位，再由你决定接不接。",
  },
  "N-013": {
    initiativeBand: "nudge",
    hookIds: ["xp.npc.n013.draft_drop", "task:studio503.residue"],
    dmOneLiner: "可掉落半张草图引你去某层，不替你解读草图含义。",
  },
  "N-007": {
    initiativeBand: "observe",
    hookIds: ["xp.npc.n007.mirror_comment", "task:mirror.counter.read"],
    dmOneLiner: "可在镜面反射里先眨眼再说话，把「异常」摆你面前让你追不追。",
  },
};

function experienceFlagsFromWorld(s: PlayerWorldSignals): string[] {
  return s.worldFlags.filter((f) => f.startsWith("xp.") || f.startsWith("cycle_residue."));
}

function pickPrecursorTemplate(flashBand: "none" | "precursor_band" | "imminent"): PrecursorExperienceTemplate | null {
  if (flashBand === "imminent") return PRECURSOR_EXPERIENCE_TEMPLATES.find((t) => t.flashBand === "imminent") ?? null;
  if (flashBand === "precursor_band") return PRECURSOR_EXPERIENCE_TEMPLATES.find((t) => t.flashBand === "precursor_band") ?? null;
  return null;
}

function sixReactionLinesForNearby(nearbyMajorNpcIds: readonly string[], template: PrecursorExperienceTemplate): Array<{ npcId: string; line: string }> {
  const out: Array<{ npcId: string; line: string }> = [];
  for (const id of nearbyMajorNpcIds) {
    if (!MAJOR_NPC_IDS.includes(id as MajorNpcId)) continue;
    const m = getMajorNpcDeepCanon(id as MajorNpcId);
    if (!m) continue;
    const role = m.teamBridgeRole;
    const line = template.sixAxisReactions[role];
    if (line) out.push({ npcId: id, line });
  }
  return out.slice(0, 4);
}

export function buildSchoolCycleExperiencePacket(args: {
  signals: PlayerWorldSignals;
  nearbyMajorNpcIds: readonly string[];
  maxRevealRank: RevealTierRank;
}): Record<string, unknown> {
  const st = computeCycleTimeState(args.signals);
  const xpFlags = experienceFlagsFromWorld(args.signals);
  const base: Record<string, unknown> = {
    schema: "school_cycle_experience_v1",
    maxRevealRankInjected: args.maxRevealRank,
    evidenceTraceKinds: [...FAILURE_CYCLE_TRACE_KINDS],
    evidenceLabels: FAILURE_TRACE_LABELS,
    residualChannels: RESIDUAL_EVIDENCE_CHANNELS.map((c) => ({
      id: c.playerFacingId,
      traceKind: c.traceKind,
      label: c.shortLabel,
      hook: c.suggestedTaskHook,
    })),
    litByWorldFlags: xpFlags.slice(0, 8),
  };

  if (args.maxRevealRank < REVEAL_TIER_RANK.fracture) {
    return {
      ...base,
      band: "surface",
      pullLine:
        "失败轮次可留可控痕迹与下一环抓手；高魅力 NPC 可主动「碰」你一下剧情，不替你按键。详情见 deep+ 与本包残响通道。",
    };
  }

  const tpl = pickPrecursorTemplate(st.flashProximity);
  const precursorPayload =
    tpl && (st.precursorPhaseActive || st.flashProximity === "imminent")
      ? {
          templateId: tpl.id,
          env: tpl.envLine,
          sixNearby: sixReactionLinesForNearby(args.nearbyMajorNpcIds, tpl),
          mundaneMisread: tpl.mundaneNpcMisread,
        }
      : null;

  const initiativeRows = args.nearbyMajorNpcIds
    .filter((id): id is MajorNpcId => MAJOR_NPC_IDS.includes(id as MajorNpcId))
    .slice(0, 4)
    .map((id) => {
      const h = MAJOR_NPC_PROACTIVE_HOOKS[id];
      const m = getMajorNpcDeepCanon(id);
      return {
        npcId: id,
        displayName: m?.displayName ?? id,
        initiativeBand: h.initiativeBand,
        hookIds: [...h.hookIds],
        dmOneLiner: h.dmOneLiner,
      };
    });

  if (args.maxRevealRank < REVEAL_TIER_RANK.deep) {
    return {
      ...base,
      band: "fracture",
      pullLine: "旧轮痕迹是证据与情绪抓手，不是设定考试；重连有阶段，亲近须挣。",
      residuePerception: Object.values(RELINK_RESIDUE_PERCEPTION_MODES).map((x) => ({ id: x.id, summary: x.summary })),
      carryoverMeta: FAILURE_CARRYOVER_META.filter((x) => x.implementationStatus === "packet_ready"),
      precursor: precursorPayload,
      npcInitiative: initiativeRows,
    };
  }

  return {
    ...base,
    band: "mechanism",
    pullLine: "失败推进叙事：裁剪坏分支但保留认知/路线/关系/线索型元增益钩子；谜语须落到可交互物证或 NPC 反应。",
    residuePerception: Object.values(RELINK_RESIDUE_PERCEPTION_MODES),
    carryoverMeta: FAILURE_CARRYOVER_META,
    precursor: precursorPayload,
    npcInitiative: initiativeRows,
    antiSpoilerNote: "具体是否触发某痕迹/增益由服务端 worldFlags 与任务回写决定；无 flag 时仅作风格参考。",
  };
}

export function buildSchoolCycleExperiencePacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const ch = (p.residualChannels as unknown[] | undefined)?.slice(0, 3) ?? [];
  const pr = p.precursor as Record<string, unknown> | null | undefined;
  const ni = (p.npcInitiative as unknown[] | undefined)?.slice(0, 2) ?? [];
  return {
    schema: p.schema,
    b: p.band,
    pl: typeof p.pullLine === "string" ? p.pullLine.slice(0, 120) : null,
    ch: ch.map((x) => {
      const r = x as Record<string, unknown>;
      return { id: r.id, k: r.traceKind };
    }),
    pre: pr
      ? {
          id: pr.templateId,
          e: typeof pr.env === "string" ? pr.env.slice(0, 80) : null,
        }
      : null,
    ni: ni.map((row) => {
      const r = row as Record<string, unknown>;
      return { id: r.npcId, ib: r.initiativeBand, h: (r.hookIds as string[] | undefined)?.slice(0, 2) };
    }),
    f: (p.litByWorldFlags as string[] | undefined)?.slice(0, 4),
  };
}

export function buildPlayerExperienceSchoolCycleFactsForCanon(): Array<{
  factKey: string;
  canonicalText: string;
  tags: string[];
}> {
  const tags = ["player_experience", "school_cycle", "reveal_fracture", "xp_layer"];
  const out: Array<{ factKey: string; canonicalText: string; tags: string[] }> = [];
  out.push({
    factKey: "xp_layer:residual_evidence",
    canonicalText: RESIDUAL_EVIDENCE_CHANNELS.map(
      (c) => `【${c.playerFacingId}】${c.shortLabel}：${c.narrativeBudget} hook:${c.suggestedTaskHook}`
    ).join(""),
    tags,
  });
  out.push({
    factKey: "xp_layer:relink_residue",
    canonicalText: Object.values(RELINK_RESIDUE_PERCEPTION_MODES)
      .map((x) => `【${x.id}】${x.summary}`)
      .join(""),
    tags,
  });
  out.push({
    factKey: "xp_layer:failure_carryover",
    canonicalText: FAILURE_CARRYOVER_META.map(
      (x) => `【${x.id}】${x.category} ${x.implementationStatus}：${x.playerValueLine}`
    ).join(""),
    tags: [...tags, "reveal_deep"],
  });
  for (const t of PRECURSOR_EXPERIENCE_TEMPLATES) {
    out.push({
      factKey: `xp_layer:precursor_${t.id}`,
      canonicalText: `【${t.id}】${t.envLine} 普通人误读：${t.mundaneNpcMisread}`,
      tags,
    });
  }
  return out;
}
