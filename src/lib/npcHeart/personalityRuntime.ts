import type { NpcRelationStateV2 } from "@/lib/registry/types";
import type {
  NpcCharmTier,
  NpcHeartRuntimeBehavioralHints,
  NpcPersonalityCore,
  NpcPersonalityScenarioMatrix,
} from "./personalityContracts";

export type NpcHeartRuntimeAttitude = "warm" | "neutral" | "guarded" | "hostile";

function clip(s: string, n: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= n ? t : t.slice(0, n);
}

/** 由态度与情境矩阵生成「当下诉求」短句，替代四人一面模板 */
export function buildWhatNpcWantsFromScenarios(args: {
  attitude: NpcHeartRuntimeAttitude;
  scenarios: NpcPersonalityScenarioMatrix;
  charmTier: NpcCharmTier;
}): string {
  const { attitude, scenarios, charmTier } = args;
  const dense = charmTier === "major_charm" ? 52 : 44;
  switch (attitude) {
    case "warm":
      return clip(`${scenarios.intimacyWarmedStyle}；仍要互惠与边界`, dense + 8);
    case "hostile":
      return clip(`${scenarios.angerStyle}；少碰禁区`, dense);
    case "guarded":
      return clip(`${scenarios.probeStyle}；先验你再谈合作`, dense);
    default:
      return clip(`${scenarios.demandStyle}`, dense);
  }
}

const MAJOR_FORBIDDEN_CARICATURE: Record<string, string> = {
  "N-015": "勿写成温柔知心哥哥/话痨解说",
  "N-020": "勿写成无脑甜妹或纯搞笑役",
  "N-010": "勿写成全知温柔神婆或替你包办一切",
  "N-018": "勿写成痞气霸道总裁式宠溺",
  "N-013": "勿写成单纯可怜弟弟或单一病娇",
  "N-007": "勿写成刻板高冷嘴毒无弱点",
};

/**
 * 由稳定核 + 情境矩阵 + 关系/场景得到单回合行为线索（确定性，跨回合锚点不变，仅权重随态度变）。
 */
export function buildPersonalityRuntimeHints(args: {
  npcId: string;
  core: NpcPersonalityCore;
  scenarios: NpcPersonalityScenarioMatrix;
  relation: NpcRelationStateV2;
  attitude: NpcHeartRuntimeAttitude;
  hotThreatPresent: boolean;
  charmTier: NpcCharmTier;
}): NpcHeartRuntimeBehavioralHints {
  const { core, scenarios, relation, attitude, hotThreatPresent, charmTier, npcId } = args;

  let modeLine = "";
  if (hotThreatPresent) modeLine = scenarios.crisisAuthenticReaction;
  else if (attitude === "hostile") modeLine = scenarios.angerStyle;
  else if (attitude === "warm") modeLine = scenarios.intimacyWarmedStyle;
  else if (attitude === "guarded") modeLine = scenarios.probeStyle;
  else if (relation.trust <= 18 && relation.fear < 50) modeLine = scenarios.firstContactStyle;
  else modeLine = scenarios.demandStyle;

  const speakThisRound = clip(
    `${clip(core.speechCadence, 56)}｜${clip(modeLine, 56)}｜惯用：${clip(core.recurringGesture, 36)}`,
    168
  );

  const pushPull =
    attitude === "warm"
      ? clip(`拉近：${core.intimacyResponse}；仍保留：${core.emotionalDefenseStyle}`, 120)
      : attitude === "hostile"
        ? clip(`推远：${core.stressResponse}；压制：${core.powerExpression}`, 120)
        : clip(`试探：${core.suspicionResponse}；防线：${core.emotionalDefenseStyle}`, 120);

  const likelySlip = clip(`${core.emotionalSlipPattern}；裂隙：${core.contradictionSignature}`, 100);

  const baseForbidden =
    charmTier === "major_charm"
      ? `禁扁平模板：${MAJOR_FORBIDDEN_CARICATURE[npcId] ?? "禁与另一高魅力NPC同质化口吻"}`
      : "禁写成客服NPC或纯任务播报机";

  const forbiddenCaricature = clip(`${baseForbidden}；${clip(core.selfImage, 40)}`, 140);

  const compactBehaviorLine = clip(
    `口：${clip(core.speechCadence, 32)}｜张：${clip(core.identityTension, 28)}｜残：${clip(core.memoryResidueFlavor, 28)}｜主：${clip(scenarios.protagonistResidueManifestation, 36)}`,
    200
  );

  return {
    speakThisRound,
    pushPullThisRound: pushPull,
    likelySlip,
    forbiddenCaricature,
    compactBehaviorLine,
  };
}
