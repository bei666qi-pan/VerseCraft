/**
 * 基础态度层构建：世界观基线 + 关系叠加（关系不可单独覆盖世界观）。
 */

import type { NpcRelationStateV2 } from "@/lib/registry/types";
import { getNpcCanonicalIdentity, isNpcAllowedToKnowRevealTier } from "@/lib/registry/npcCanon";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";
import { normalizeRelationStatePartial } from "@/lib/npcHeart/build";
import type {
  BaselineViewOfPlayerKind,
  MergeNpcBaselineInput,
  NpcBaselineAttitude,
  NpcBaselineMerged,
  NpcBaselineSceneContext,
  NpcPlayerBaselinePacket,
} from "./types";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

const DEFAULT_SCENE: NpcBaselineSceneContext = {
  locationId: "unknown",
  hotThreatPresent: false,
  maxRevealRank: 0,
};

const VIEW_OVERRIDE: Partial<Record<string, BaselineViewOfPlayerKind>> = {
  "N-017": "suspicious_intruder",
};

function baseViewKind(npcId: string, privilege: string): BaselineViewOfPlayerKind {
  const o = VIEW_OVERRIDE[npcId];
  if (o) return o;
  if (privilege === "xinlan" || privilege === "major_charm" || privilege === "night_reader") {
    return "familiar_fragment_echo";
  }
  return "intruded_student";
}

function scalarsForPrivilege(privilege: string): {
  warmth: number;
  guardedness: number;
  suspicion: number;
  curiosity: number;
  protectiveness: number;
  distance: number;
  ceiling: number;
} {
  switch (privilege) {
    case "xinlan":
      return {
        warmth: 55,
        guardedness: 30,
        suspicion: 22,
        curiosity: 58,
        protectiveness: 48,
        distance: 32,
        ceiling: 88,
      };
    case "major_charm":
      return {
        warmth: 46,
        guardedness: 38,
        suspicion: 32,
        curiosity: 48,
        protectiveness: 42,
        distance: 40,
        ceiling: 72,
      };
    case "night_reader":
      return {
        warmth: 42,
        guardedness: 44,
        suspicion: 38,
        curiosity: 52,
        protectiveness: 36,
        distance: 44,
        ceiling: 68,
      };
    default:
      return {
        warmth: 34,
        guardedness: 42,
        suspicion: 28,
        curiosity: 30,
        protectiveness: 18,
        distance: 56,
        ceiling: 32,
      };
  }
}

export function buildNpcBaselineAttitude(
  npcId: string,
  scene: NpcBaselineSceneContext,
  _relationState: NpcRelationStateV2
): NpcBaselineAttitude {
  void _relationState;
  void scene;
  const canon = getNpcCanonicalIdentity(npcId);
  const priv = canon.memoryPrivilege;
  const s = scalarsForPrivilege(priv);
  const view = baseViewKind(canon.npcId, priv);

  const greetingStyleRule =
    priv === "xinlan"
      ? "公事壳先落地：登记事由、动线半步；名单边缘的不适藏顿句里，禁止客服推销与任务口播。"
      : priv === "night_reader"
        ? "像在翻别页：停顿、打量，少昵称；不默认玩家懂楼里账，也不解说消化链。"
        : priv === "major_charm"
          ? "熟得不对劲却说不清哪里熟；开口前多半拍迟疑，禁止一口老同学或旧队友寒暄。"
          : "又一拨月初误闯的学生：先当路人事务，再谈帮不帮；禁止客服腔、禁止系统发单腔。";

  const truthRevealRule =
    priv === "xinlan"
      ? "真相分层：随 reveal 档位与 packet 许可渐进；禁止替玩家一口说尽七锚/闭环。"
      : priv === "major_charm"
        ? "校源语义仅当档位允许；否则只保留公寓职能壳。"
        : priv === "night_reader"
          ? "偏观察与记录感，不默认确认玩家知晓消化链全貌。"
          : "只描述可见秩序与传闻，不主动输出高维真相。";

  const crisisResponseRule =
    priv === "xinlan"
      ? "危机中优先给可执行半步，不替玩家选命运；语气稳、句子短。"
      : priv === "major_charm" || priv === "night_reader"
        ? "危机中可出现保护冲动或后退试探，但仍需保留不信任余量。"
        : "危机中优先自保与规则边界提醒，不默认与玩家结盟。";

  return {
    npcId: canon.npcId,
    baselineViewOfPlayer: view,
    baselineWarmth: s.warmth,
    baselineGuardedness: s.guardedness,
    baselineSuspicion: s.suspicion,
    baselineCuriosity: s.curiosity,
    baselineProtectiveness: s.protectiveness,
    baselineDistance: s.distance,
    greetingStyleRule,
    truthRevealRule,
    crisisResponseRule,
    shouldAskHowPlayerKnowsThis: priv === "normal" || priv === "night_reader",
    shouldAvoidOverfamiliarity: priv === "normal" || priv === "major_charm",
    allowedFamiliarityCeiling: s.ceiling,
  };
}

export function mergeNpcBaselineWithRelation(input: MergeNpcBaselineInput): NpcBaselineMerged {
  const { baseline, relation, scene } = input;
  const priv = getNpcCanonicalIdentity(baseline.npcId).memoryPrivilege;

  let warmth = baseline.baselineWarmth + relation.trust * 0.12 - relation.fear * 0.14;
  let guardedness = baseline.baselineGuardedness - relation.trust * 0.06 + relation.fear * 0.16;
  let suspicion = baseline.baselineSuspicion + relation.fear * 0.1 - relation.trust * 0.04;
  let curiosity = baseline.baselineCuriosity + relation.trust * 0.05;
  let protectiveness = baseline.baselineProtectiveness + Math.max(0, relation.affection) * 0.08;
  let distance = baseline.baselineDistance - relation.trust * 0.1 + relation.fear * 0.12;

  if (scene.hotThreatPresent) {
    guardedness += 8;
    suspicion += 6;
    distance += 5;
  }

  warmth = clamp(warmth, 0, 100);
  guardedness = clamp(guardedness, 0, 100);
  suspicion = clamp(suspicion, 0, 100);
  curiosity = clamp(curiosity, 0, 100);
  protectiveness = clamp(protectiveness, 0, 100);
  distance = clamp(distance, 0, 100);

  let effectiveView: BaselineViewOfPlayerKind = baseline.baselineViewOfPlayer;
  if (relation.fear >= 58 && priv === "normal") {
    effectiveView = "suspicious_intruder";
  } else if (relation.trust >= 40 && relation.fear < 35 && baseline.baselineViewOfPlayer === "intruded_student") {
    effectiveView = "displaced_student";
  }

  if (priv === "xinlan" && relation.trust >= 48 && scene.maxRevealRank >= REVEAL_TIER_RANK.fracture) {
    effectiveView = "knows_truth";
  }

  if (priv === "normal") {
    effectiveView =
      effectiveView === "familiar_fragment_echo" || effectiveView === "knows_truth"
        ? "intruded_student"
        : effectiveView;
  }

  const familiarityScore = warmth + (100 - distance) * 0.35;
  const boostedCeiling =
    baseline.allowedFamiliarityCeiling + (priv === "normal" ? 0 : Math.min(22, relation.trust * 0.22));
  const canExpressFamiliarity = familiarityScore <= boostedCeiling;

  const avoidMisalignment: string[] = [
    "禁止客服腔、任务刷屏、与公寓规则无关的漫聊网友感。",
    priv === "normal" ? "禁止默认与玩家旧识或共享他 NPC 私密。" : "禁止一见如故式旧队友话术，除非 packet 许可重连档位。",
  ];

  if (priv === "xinlan") {
    avoidMisalignment.push("禁止每回合全盘揭露真相或替玩家总结七锚链。");
  }

  const compactNarrativeHint = [
    `视角:${effectiveView}`,
    `距离${Math.round(distance)}/熟悉上限${baseline.allowedFamiliarityCeiling}`,
    baseline.greetingStyleRule.slice(0, 48),
  ].join("｜");

  const monthlyEntry = getVerseCraftRolloutFlags().enableMonthlyStudentEntry;

  const playerAddressCue = (() => {
    if (priv === "xinlan") {
      return "称「这边」「先登记」；名单像旧纸撕口的不适藏顿句。";
    }
    if (priv === "night_reader") {
      return monthlyEntry
        ? "像在别页里见过；少昵称、多停顿，不默认玩家懂楼里账。"
        : "像在别页里见过；少昵称、多停顿。";
    }
    if (priv === "major_charm") {
      return monthlyEntry
        ? "迟疑后称「你」；熟得异常却说不清，禁一口旧识。"
        : "迟疑后称「你」；熟得不对劲，禁一口旧识。";
    }
    if (!monthlyEntry && priv === "normal" && effectiveView === "intruded_student") {
      return "称同学/年轻人；先事务再套近乎（不强调月初误入叙事）。";
    }
    return effectiveView === "intruded_student"
      ? "又一拨月初误闯的学生；同学/年轻人，先事务再套近乎。"
      : "保持距离，不套近乎。";
  })();

  const playerInteractionStanceCue = (() => {
    if (priv === "xinlan") {
      return "公事先行；可试探来处，不替玩家揭底；不适可藏半句。";
    }
    if (priv === "night_reader") {
      return "多看少说；回避深问全貌；偶刺半句观察。";
    }
    if (priv === "major_charm") {
      return "熟感用迟疑表现；可交换条件；禁解说校源与七锚。";
    }
    if (scene.hotThreatPresent) {
      return "先自保与边界提醒；不默认与玩家结盟。";
    }
    return baseline.shouldAskHowPlayerKnowsThis
      ? "可半句试探与规则提醒；禁系统发单腔与客服口播。"
      : "保持距离；不主动兜售任务。";
  })();

  return {
    npcId: baseline.npcId,
    effectiveViewOfPlayer: effectiveView,
    warmth,
    guardedness,
    suspicion,
    curiosity,
    protectiveness,
    distance,
    canExpressFamiliarity,
    avoidMisalignment,
    compactNarrativeHint,
    playerAddressCue,
    playerInteractionStanceCue,
    shouldAskHowPlayerKnowsThis: baseline.shouldAskHowPlayerKnowsThis,
    shouldAvoidOverfamiliarity: baseline.shouldAvoidOverfamiliarity || (priv === "normal" && relation.trust > 70),
    allowedFamiliarityCeiling: baseline.allowedFamiliarityCeiling,
  };
}

export function getNpcDefaultPlayerFraming(npcId: string): BaselineViewOfPlayerKind {
  const canon = getNpcCanonicalIdentity(npcId);
  return baseViewKind(canon.npcId, canon.memoryPrivilege);
}

export function getNpcTruthRevealCeiling(npcId: string): RevealTierRank {
  return getNpcCanonicalIdentity(npcId).revealTierCap;
}

/**
 * 仅极少数特权与关系阈值同时满足时，才允许「旧友」式口吻（仍受 packet 门闸约束）。
 */
export function shouldNpcTreatPlayerAsKnownOldFriend(
  npcId: string,
  relationPartial?: Partial<NpcRelationStateV2> | null
): boolean {
  const canon = getNpcCanonicalIdentity(npcId);
  const r = normalizeRelationStatePartial(relationPartial);
  if (canon.memoryPrivilege === "normal") return false;
  if (canon.memoryPrivilege === "xinlan") {
    return r.trust >= 52 && r.affection >= 38;
  }
  if (canon.memoryPrivilege === "major_charm" || canon.memoryPrivilege === "night_reader") {
    return r.trust >= 78 && r.favorability >= 58 && r.romanceStage !== "none";
  }
  return false;
}

export function buildEmptyNpcPlayerBaselinePacket(): NpcPlayerBaselinePacket {
  return {
    npcId: "",
    baselineViewOfPlayer: "intruded_student",
    mergedViewOfPlayer: "intruded_student",
    canShowFamiliarity: false,
    avoidMisalignment: ["当前无在场 NPC：勿编造对白对象；保持环境与氛围叙事。"],
    crisisResponseStyle: "以环境与规则压迫为主，不硬塞 NPC 台词。",
    truthRevealCeiling: 0,
    greetingStyleRule: "—",
    truthRevealRule: "—",
    relationModHint: { trustDelta: 0, fearDelta: 0 },
    baselineVersusRelationNote: "无聚焦 NPC；关系修正不适用。",
    playerAddressCue: "—",
    playerInteractionStanceCue: "—",
  };
}

export function buildNpcPlayerBaselinePacket(args: {
  npcId: string;
  relationPartial?: Partial<NpcRelationStateV2> | null;
  scene?: Partial<NpcBaselineSceneContext> | null;
}): NpcPlayerBaselinePacket {
  const npcId = args.npcId.trim();
  const relation = normalizeRelationStatePartial(args.relationPartial);
  const scene: NpcBaselineSceneContext = {
    ...DEFAULT_SCENE,
    ...args.scene,
    maxRevealRank: args.scene?.maxRevealRank ?? DEFAULT_SCENE.maxRevealRank,
  };
  const baseline = buildNpcBaselineAttitude(npcId, scene, relation);
  const merged = mergeNpcBaselineWithRelation({ baseline, relation, scene });
  const canon = getNpcCanonicalIdentity(npcId);
  const ceiling = canon.revealTierCap;

  const baselineVersusRelationNote =
    "关系值只修正语气与试探深度，不替换「误闯学生/碎片回声」世界观底层。";

  return {
    npcId: canon.npcId,
    baselineViewOfPlayer: baseline.baselineViewOfPlayer,
    mergedViewOfPlayer: merged.effectiveViewOfPlayer,
    canShowFamiliarity: merged.canExpressFamiliarity,
    avoidMisalignment: merged.avoidMisalignment.slice(0, 6),
    crisisResponseStyle: baseline.crisisResponseRule.slice(0, 200),
    truthRevealCeiling: ceiling,
    greetingStyleRule: baseline.greetingStyleRule.slice(0, 200),
    truthRevealRule: baseline.truthRevealRule.slice(0, 200),
    relationModHint: {
      trustDelta: clamp(relation.trust / 100, -1, 1),
      fearDelta: clamp(relation.fear / 100, -1, 1),
    },
    baselineVersusRelationNote,
    playerAddressCue: merged.playerAddressCue.slice(0, 120),
    playerInteractionStanceCue: merged.playerInteractionStanceCue.slice(0, 96),
  };
}

/** 供校验层：某档真相是否允许该 NPC 叙述 */
export function npcMayNarrateRevealTier(npcId: string, tier: RevealTierRank): boolean {
  return isNpcAllowedToKnowRevealTier(npcId, tier);
}
