/**
 * 阶段 6：人物 / 校源伏笔 / 任务叙事层 / 时间档位 → 紧凑 JSON packets（禁止 lore dump）。
 */
import { buildNpcHeartRuntimeView } from "@/lib/npcHeart/selectors";
import { MAJOR_NPC_IDS, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import { MAJOR_NPC_SCHOOL_REVEAL_LADDERS } from "@/lib/registry/majorNpcRevealLadder";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";
import type { TaskNarrativeLayerKind } from "@/lib/tasks/taskRoleModel";
import { ACTION_TIME_COST_GUIDE, ACTION_TIME_HOUR_FRACTION } from "@/lib/time/timeRules";
import type { ActionTimeCostKind } from "@/lib/time/actionCost";
import {
  enableFineGrainTimeCost,
  enableMajorNpcForeshadow,
  enableNpcPersonalityCoreV2,
  enableTaskModeLayer,
} from "@/lib/playRealtime/npcNarrativeRolloutFlags";

const RT_TASK_LAYERS_RE = /【rt_task_layers】([^\s。]+)/;

function decodeRtTaskIdSegment(enc: string): string {
  const t = String(enc ?? "").trim();
  if (!t) return "";
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

export function parseRtTaskLayers(playerContext: string): Array<{ taskId: string; layer: TaskNarrativeLayerKind }> {
  const m = playerContext.match(RT_TASK_LAYERS_RE);
  if (!m?.[1]) return [];
  const raw = m[1].trim();
  const out: Array<{ taskId: string; layer: TaskNarrativeLayerKind }> = [];
  for (const part of raw.split(/[,，]/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const id = decodeRtTaskIdSegment(part.slice(0, eq));
    const layer = part.slice(eq + 1).trim();
    if (!id || !layer) continue;
    if (layer === "soft_lead" || layer === "conversation_promise" || layer === "formal_task") {
      out.push({ taskId: id, layer });
    }
  }
  return out.slice(0, 14);
}

function clampStr(s: string, n: number): string {
  const t = String(s ?? "").trim();
  return t.length <= n ? t : t.slice(0, n);
}

/** 从玩家上下文图鉴行粗取好感（仅用于心核 runtime 近似，非战斗数值） */
function parseFavorabilityForDisplayName(playerContext: string, displayName: string): number {
  if (!displayName) return 0;
  const esc = displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${esc}\\[[^\\]]*好感(-?\\d+)`);
  const m = playerContext.match(re);
  const n = m?.[1] ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function inferRelationStubFromFavorability(fav: number): { favorability: number; trust: number; fear: number; debt: number } {
  const f = Math.max(-30, Math.min(80, fav));
  return {
    favorability: f,
    trust: Math.max(0, Math.min(60, 12 + Math.round(f * 0.35))),
    fear: f < 0 ? 28 : f < 20 ? 18 : 10,
    debt: 0,
  };
}

function inferSuggestedTimeCost(latestUserInput: string): ActionTimeCostKind {
  if (!enableFineGrainTimeCost()) return "standard";
  const t = String(latestUserInput ?? "").trim();
  if (t.length <= 0) return "standard";
  const short = t.length < 18;
  if (short && /^(嗯|哦|好|是|不|没|等|再看|点头|沉默)/.test(t)) return "light";
  if (short && /聊|问|试探|看一眼|打量|听听|随口/.test(t)) return "light";
  if (/跑|逃|冲|撞|打|硬闯|拼命|危机|血|刀|火/.test(t)) return "dangerous";
  if (/上楼|下楼|去.*层|跨层|电梯|楼梯|离开.*F|B2|7F/.test(t)) return "heavy";
  if (/洗|锻|交易|登记|服务|办手续|交货|付账/.test(t)) return "heavy";
  return "standard";
}

export function buildNarrativeTaskModePacket(
  layers: Array<{ taskId: string; layer: TaskNarrativeLayerKind }>
): Record<string, unknown> {
  const counts = { soft_lead: 0, conversation_promise: 0, formal_task: 0 };
  for (const x of layers) counts[x.layer] += 1;
  return {
    schema: "narrative_task_mode_v1",
    entries: layers.slice(0, 10).map((e) => ({ id: e.taskId, mode: e.layer })),
    counts,
    rules: [
      "soft_lead / conversation_promise：禁止系统式发单、禁止「你已接取任务」；用暗示、人情、口头约定写后果。",
      "formal_task：仍须先经 NPC 动作/试探/交换再收束为可追踪目标，禁止开门第一句贴任务条。",
    ],
  };
}

export function buildNarrativeTaskModePacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const entries = (p.entries as Array<{ id: string; mode: string }> | undefined) ?? [];
  return {
    sch: "ntm_v1",
    e: entries.slice(0, 5).map((x) => `${x.id}:${x.mode}`),
    r: (p.rules as string[] | undefined)?.slice(0, 1) ?? [],
  };
}

export function buildActionTimeCostPacket(args: {
  pendingHourFraction: number;
  latestUserInput: string;
}): Record<string, unknown> {
  const suggest = inferSuggestedTimeCost(args.latestUserInput);
  return {
    schema: "action_time_cost_v1",
    tiers_order: ["free", "light", "standard", "heavy", "dangerous"],
    hour_fraction_ref: {
      light: ACTION_TIME_HOUR_FRACTION.light,
      standard: ACTION_TIME_HOUR_FRACTION.standard,
      heavy: ACTION_TIME_HOUR_FRACTION.heavy,
      dangerous: ACTION_TIME_HOUR_FRACTION.dangerous,
    },
    suggest_for_this_turn: suggest,
    guide_one_liner: clampStr(ACTION_TIME_COST_GUIDE[suggest] ?? ACTION_TIME_COST_GUIDE.standard, 72),
    pending_hour_fraction: args.pendingHourFraction > 0.001 ? Number(args.pendingHourFraction.toFixed(3)) : 0,
    narrative_align:
      "叙事时间感须与档位一致：light=短促停顿；standard=场景内完整推进；heavy/dangerous=体力与风险消耗可被感知。",
  };
}

export function buildActionTimeCostPacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  return {
    sch: "atc_v1",
    s: p.suggest_for_this_turn,
    ph: p.pending_hour_fraction,
    g: clampStr(String(p.guide_one_liner ?? ""), 56),
  };
}

export function buildActorRevealStylePacket(args: {
  focusNpcId: string | null;
  maxRevealRank: RevealTierRank;
  charmTier: "standard" | "major_charm";
}): Record<string, unknown> {
  const major = args.charmTier === "major_charm";
  const xinlanPull = args.focusNpcId === "N-010";
  return {
    schema: "actor_reveal_style_v1",
    focusNpcId: args.focusNpcId,
    charm_tier: args.charmTier,
    max_reveal_rank: args.maxRevealRank,
    pace: major ? "gradual_micro_cue" : "scene_pragmatic",
    xinlan_stronger_pull_ok: xinlanPull,
    xinlan_rules: xinlanPull
      ? ["牵引可更强：登记/路线/代价感；仍不得一次写穿 deep 校源专名。", "层级感：先异常体感，再裂缝，再验证。"]
      : [],
    global: ["校源面只渐进；无 packet 许可不写结论式真相。", "高魅力六人禁止互抄同一套「温柔解说腔」。"],
  };
}

export function buildActorRevealStylePacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  return {
    sch: "ars_v1",
    ct: p.charm_tier,
    xr: p.max_reveal_rank,
    xp: p.xinlan_stronger_pull_ok === true ? 1 : 0,
  };
}

export function buildActorForeshadowPacket(args: {
  focusNpcId: string | null;
  maxRevealRank: RevealTierRank;
}): Record<string, unknown> {
  const id = args.focusNpcId;
  if (!id || !(MAJOR_NPC_IDS as readonly string[]).includes(id)) {
    return {
      schema: "actor_foreshadow_v1",
      focusNpcId: null,
      policy: "非高魅力焦点：只用场景异常与关系推近，不写校籍结论。",
      allow_behavior_cues: [],
      ban_lexicon_hard: [],
      mood_links: [],
    };
  }
  const ladder = MAJOR_NPC_SCHOOL_REVEAL_LADDERS[id as MajorNpcId];
  const canDeepProper = args.maxRevealRank >= REVEAL_TIER_RANK.deep;
  const cues = ladder.surface_behavior_hints.slice(0, 2).map((x) => clampStr(x, 64));
  const fractureCue = ladder.fracture_signals[0] ? clampStr(ladder.fracture_signals[0], 64) : "";
  const ban = canDeepProper ? [] : ladder.neverLeakBeforeDeep.slice(0, 6);
  return {
    schema: "actor_foreshadow_v1",
    focusNpcId: id,
    anomaly_line: clampStr(ladder.profileSurfaceAnomalyLine, 100),
    allow_behavior_cues: cues,
    fracture_tease_ok: args.maxRevealRank >= REVEAL_TIER_RANK.fracture ? clampStr(fractureCue, 72) : "",
    ban_lexicon_hard: ban,
    mood_links: ["器物细节", "站位/节拍", "反常安静", "体温/呼吸"].slice(0, 4),
    no_answer_rule: "只给可感知异常与行为矛盾，不给校籍判决书；禁止替玩家总结「原来你是X校」式结论。",
    deep_payload_locked: !canDeepProper,
  };
}

export function buildActorForeshadowPacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  return {
    sch: "afx_v1",
    id: p.focusNpcId,
    c: (p.allow_behavior_cues as string[] | undefined)?.slice(0, 2).map((x) => clampStr(x, 48)) ?? [],
    b: (p.ban_lexicon_hard as string[] | undefined)?.slice(0, 4) ?? [],
    lk: (p.mood_links as string[] | undefined)?.slice(0, 3) ?? [],
    l: p.deep_payload_locked === true ? 1 : 0,
  };
}

export function buildActorPersonalityPacketFromView(
  view: NonNullable<ReturnType<typeof buildNpcHeartRuntimeView>>
): Record<string, unknown> {
  const p = view.profile;
  const h = view.behavioralHints;
  return {
    schema: "actor_personality_v1",
    npcId: p.npcId,
    displayName: p.displayName,
    charm_tier: p.charmTier,
    attitude: view.attitudeLabel,
    core_temper: clampStr(`${p.surfaceMask}｜${p.coreDrive}`, 96),
    speech_rhythm: clampStr(p.speechContract, 80),
    this_round_speak: clampStr(h.speakThisRound, 88),
    probe_push_pull: clampStr(h.pushPullThisRound, 72),
    must_not_caricature: clampStr(h.forbiddenCaricature, 80),
    compact_behavior: clampStr(h.compactBehaviorLine, 96),
    wants_now: clampStr(view.whatNpcWantsFromPlayerNow, 72),
  };
}

export function buildActorPersonalityPacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  return {
    sch: "aper_v1",
    id: p.npcId,
    nm: p.displayName,
    ct: p.charm_tier,
    ad: p.attitude,
    sp: clampStr(String(p.this_round_speak ?? ""), 56),
    mn: clampStr(String(p.must_not_caricature ?? ""), 48),
  };
}

export function buildActorResiduePacketFromView(
  view: NonNullable<ReturnType<typeof buildNpcHeartRuntimeView>>
): Record<string, unknown> {
  const p = view.profile;
  const h = view.behavioralHints;
  return {
    schema: "actor_residue_v1",
    npcId: p.npcId,
    emotional_hook: clampStr(p.emotionalDebtPattern, 72),
    likely_slip: clampStr(h.likelySlip, 56),
    taboo_touch: clampStr(p.tabooBoundary, 64),
    residue_note: "本回合余温应落在「未说满的那半句」与身体细节，不写设定清单。",
  };
}

export function buildActorResiduePacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  return {
    sch: "ares_v1",
    id: p.npcId,
    sl: clampStr(String(p.likely_slip ?? ""), 40),
    tb: clampStr(String(p.taboo_touch ?? ""), 40),
  };
}

export type ActorConstraintBundle = {
  actor_personality_packet: Record<string, unknown>;
  actor_residue_packet: Record<string, unknown>;
  actor_foreshadow_packet: Record<string, unknown>;
  narrative_task_mode_packet: Record<string, unknown>;
  action_time_cost_packet: Record<string, unknown>;
  actor_reveal_style_packet: Record<string, unknown>;
};

export function buildActorConstraintBundle(args: {
  playerContext: string;
  latestUserInput: string;
  focusNpcId: string | null;
  location: string;
  maxRevealRank: RevealTierRank;
  hotThreatPresent: boolean;
  activeTaskIds: string[];
  pendingHourFraction: number;
}): ActorConstraintBundle {
  const layers = enableTaskModeLayer() ? parseRtTaskLayers(args.playerContext) : [];

  let viewFinal: ReturnType<typeof buildNpcHeartRuntimeView> = null;
  if (args.focusNpcId) {
    const stub = buildNpcHeartRuntimeView({
      npcId: args.focusNpcId,
      relationPartial: {},
      locationId: args.location,
      activeTaskIds: args.activeTaskIds,
      hotThreatPresent: args.hotThreatPresent,
      maxRevealRank: args.maxRevealRank,
    });
    const displayName = stub?.profile.displayName ?? "";
    const rel = inferRelationStubFromFavorability(parseFavorabilityForDisplayName(args.playerContext, displayName));
    viewFinal = buildNpcHeartRuntimeView({
      npcId: args.focusNpcId,
      relationPartial: rel,
      locationId: args.location,
      activeTaskIds: args.activeTaskIds,
      hotThreatPresent: args.hotThreatPresent,
      maxRevealRank: args.maxRevealRank,
    });
  }

  let personality =
    viewFinal != null
      ? buildActorPersonalityPacketFromView(viewFinal)
      : {
          schema: "actor_personality_v1",
          npcId: null,
          policy: "无同场焦点 NPC：只写场景与群体，不硬拗单一心脏锚。",
        };
  let residue =
    viewFinal != null
      ? buildActorResiduePacketFromView(viewFinal)
      : { schema: "actor_residue_v1", npcId: null, residue_note: "无单锚时写环境余温即可。" };

  if (!enableNpcPersonalityCoreV2() && viewFinal != null) {
    const p = viewFinal.profile;
    personality = {
      schema: "actor_personality_v1",
      npcId: p.npcId,
      policy: "npc_personality_core_v2_disabled",
      displayName: p.displayName,
      charm_tier: p.charmTier,
    };
    residue = {
      schema: "actor_residue_v1",
      npcId: p.npcId,
      policy: "npc_personality_core_v2_disabled",
      residue_note: "v2 关闭：以场景与对白推进为主。",
    };
  }

  return {
    actor_personality_packet: personality,
    actor_residue_packet: residue,
    actor_foreshadow_packet: enableMajorNpcForeshadow()
      ? buildActorForeshadowPacket({
          focusNpcId: args.focusNpcId,
          maxRevealRank: args.maxRevealRank,
        })
      : {
          schema: "actor_foreshadow_v1",
          focusNpcId: null,
          policy: "major_npc_foreshadow_disabled",
          allow_behavior_cues: [],
          ban_lexicon_hard: [],
          mood_links: [],
        },
    narrative_task_mode_packet: buildNarrativeTaskModePacket(layers),
    action_time_cost_packet: buildActionTimeCostPacket({
      pendingHourFraction: args.pendingHourFraction,
      latestUserInput: args.latestUserInput,
    }),
    actor_reveal_style_packet: buildActorRevealStylePacket({
      focusNpcId: args.focusNpcId,
      maxRevealRank: args.maxRevealRank,
      charmTier: viewFinal?.profile.charmTier ?? "standard",
    }),
  };
}

export function compactActorConstraintBundle(b: ActorConstraintBundle): Record<string, unknown> {
  return {
    actor_personality_packet: buildActorPersonalityPacketCompact(b.actor_personality_packet),
    actor_residue_packet: buildActorResiduePacketCompact(b.actor_residue_packet),
    actor_foreshadow_packet: buildActorForeshadowPacketCompact(b.actor_foreshadow_packet),
    narrative_task_mode_packet: buildNarrativeTaskModePacketCompact(b.narrative_task_mode_packet),
    action_time_cost_packet: buildActionTimeCostPacketCompact(b.action_time_cost_packet),
    actor_reveal_style_packet: buildActorRevealStylePacketCompact(b.actor_reveal_style_packet),
  };
}
