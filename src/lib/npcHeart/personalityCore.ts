import type { NpcProfileV2, NpcSocialProfile } from "@/lib/registry/types";
import { MAJOR_NPC_IDS, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import type {
  NpcCharmTier,
  NpcPersonalityCore,
  NpcPersonalityScenarioMatrix,
} from "./personalityContracts";
import { PERSONALITY_CORE_KEYS, PERSONALITY_SCENARIO_KEYS } from "./personalityContracts";

/** 普通住户默认人格核：有人味但不抢戏 */
export const DEFAULT_MINOR_PERSONALITY_CORE: NpcPersonalityCore = {
  identityTension: "想活下去与想少惹事并存",
  coreTemper: "谨慎、偏事务性",
  emotionalDefenseStyle: "客气推挡、转移话题",
  stressResponse: "语速变快或突然安静",
  intimacyResponse: "略不自在，用玩笑或忙事挡",
  suspicionResponse: "多听少说，记住细节再表态",
  truthEvasionStyle: "打太极、推给规则或别人",
  rescueInstinctStyle: "先自保再伸手，量力而为",
  crueltyBoundary: "不主动害人；被逼急会翻脸",
  attachmentPattern: "慢热，靠小事累积信任",
  selfImage: "普通住户，不是英雄",
  shameTrigger: "被当众揭短或嘲笑怯懦",
  controlNeed: "中：希望场面别失控",
  powerExpression: "语气、站位与沉默",
  speechCadence: "白话、句长中等",
  recurringGesture: "摸口袋、看门/看楼道",
  emotionalSlipPattern: "累或怕时会多嘴一句真话",
  contradictionSignature: "嘴上说不管、脚却没走",
  memoryResidueFlavor: "偶尔觉得场景眼熟但说不清",
};

function trimOrEmpty(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

export function fillPersonalityCore(partial: Partial<NpcPersonalityCore> | null | undefined): NpcPersonalityCore {
  const out: NpcPersonalityCore = { ...DEFAULT_MINOR_PERSONALITY_CORE };
  if (!partial) return out;
  for (const k of PERSONALITY_CORE_KEYS) {
    const key = k as keyof NpcPersonalityCore;
    const v = trimOrEmpty(partial[key]);
    if (v) out[key] = v.length > 160 ? v.slice(0, 160) : v;
  }
  return out;
}

export function fillPersonalityScenarios(
  partial: Partial<NpcPersonalityScenarioMatrix> | null | undefined,
  fallback: NpcPersonalityScenarioMatrix
): NpcPersonalityScenarioMatrix {
  const out = { ...fallback };
  if (!partial) return out;
  for (const k of PERSONALITY_SCENARIO_KEYS) {
    const key = k as keyof NpcPersonalityScenarioMatrix;
    const v = trimOrEmpty(partial[key]);
    if (v) out[key] = v.length > 180 ? v.slice(0, 180) : v;
  }
  return out;
}

/** 由人格核生成普通 NPC 可用的「轻量情境句」，避免空白矩阵 */
export function buildDefaultScenarioMatrixFromCore(core: NpcPersonalityCore): NpcPersonalityScenarioMatrix {
  return {
    firstContactStyle: `事务性寒暄；${core.suspicionResponse}`,
    probeStyle: `旁敲侧击；${core.truthEvasionStyle}`,
    demandStyle: `把话落在可执行条件上；${core.controlNeed}`,
    truthAvoidanceStyle: core.truthEvasionStyle,
    angerStyle: `${core.stressResponse}；${core.powerExpression}`,
    protectStyle: `${core.rescueInstinctStyle}；${core.crueltyBoundary}`,
    intimacyWarmedStyle: `${core.intimacyResponse}；仍保留${core.emotionalDefenseStyle.slice(0, 24)}`,
    crisisAuthenticReaction: `${core.stressResponse}；${core.rescueInstinctStyle}`,
    protagonistResidueManifestation: core.memoryResidueFlavor,
  };
}

/**
 * 仅当显式字段缺失时，用 interaction/social 做极轻推断（fallback，非主路径）。
 */
export function inferPartialPersonalityCore(args: {
  profileV2: NpcProfileV2 | null;
  social: NpcSocialProfile | null;
}): Partial<NpcPersonalityCore> {
  const p = args.profileV2;
  const s = args.social;
  const speech = [trimOrEmpty(s?.speech_patterns), trimOrEmpty(p?.interaction?.speechPattern)].filter(Boolean).join("；");
  const personality = trimOrEmpty(p?.display?.publicPersonality);
  const taboo = trimOrEmpty(p?.interaction?.taboo);
  const motives = trimOrEmpty(p?.deepSecret?.trueMotives?.join("；"));
  const partial: Partial<NpcPersonalityCore> = {};

  if (speech) {
    partial.speechCadence = speech.length > 100 ? speech.slice(0, 100) : speech;
    if (/短句|低声|寡言|少话/.test(speech)) partial.speechCadence = `${partial.speechCadence}；偏短句`;
    if (/句尾|上扬|轻快/.test(speech)) partial.speechCadence = `${partial.speechCadence}；语气有起伏`;
  }
  if (personality) partial.coreTemper = personality.length > 40 ? personality.slice(0, 40) : personality;
  if (taboo) partial.shameTrigger = `触犯其禁忌：${taboo.slice(0, 60)}`;
  if (/交易|交换|价|货/.test(`${speech} ${motives}`)) {
    partial.truthEvasionStyle = "用价码与条件绕开真相";
    partial.attachmentPattern = "契约先于情绪";
  }
  if (/回避|不提|绕开|别问/.test(speech)) {
    partial.truthEvasionStyle = partial.truthEvasionStyle || "含糊带过、换题";
    partial.emotionalDefenseStyle = "冷处理或打岔";
  }
  if (/保护|守护|提醒|照应/.test(speech)) {
    partial.rescueInstinctStyle = "先给退路再谈深入";
    partial.crueltyBoundary = "不伤无辜";
  }
  if (/试探|示弱|推给你|责任/.test(speech)) {
    partial.suspicionResponse = "先示弱或套话再观察反应";
    partial.contradictionSignature = "嘴软手硬";
  }
  return partial;
}

export type ResolvedPersonalityBundle = {
  core: NpcPersonalityCore;
  scenarios: NpcPersonalityScenarioMatrix;
  charmTier: NpcCharmTier;
};

export function resolveCharmTier(npcId: string): NpcCharmTier {
  return MAJOR_NPC_IDS.includes(npcId as MajorNpcId) ? "major_charm" : "standard";
}

/**
 * 人格单一入口：显式 registry > 文本推断 > 默认核；情境矩阵显式 > core 派生。
 */
export function resolvePersonalityBundle(args: {
  npcId: string;
  profileV2: NpcProfileV2 | null;
  social: NpcSocialProfile | null;
}): ResolvedPersonalityBundle {
  const charmTier = resolveCharmTier(args.npcId);
  const explicitCore = args.profileV2?.personalityCore;
  const inferred = inferPartialPersonalityCore({ profileV2: args.profileV2, social: args.social });
  const core = fillPersonalityCore({ ...inferred, ...explicitCore });

  const fallbackScenarios = buildDefaultScenarioMatrixFromCore(core);
  const explicitScenarios = args.profileV2?.personalityScenarios;
  const scenarios = fillPersonalityScenarios(explicitScenarios ?? null, fallbackScenarios);

  return { core, scenarios, charmTier };
}
