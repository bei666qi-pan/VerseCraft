/**
 * 人格契约：稳定行为锚点（运行时优先）与情境矩阵（高魅力显式配置）。
 * 不进入 JSON 输出契约，仅供 NpcHeart / prompt 拼装。
 */

/** 跨回合稳定的人格核（registry 显式配置优先，缺省由 fallback 补齐） */
export type NpcPersonalityCore = {
  identityTension: string;
  coreTemper: string;
  emotionalDefenseStyle: string;
  stressResponse: string;
  intimacyResponse: string;
  suspicionResponse: string;
  truthEvasionStyle: string;
  rescueInstinctStyle: string;
  crueltyBoundary: string;
  attachmentPattern: string;
  selfImage: string;
  shameTrigger: string;
  controlNeed: string;
  powerExpression: string;
  speechCadence: string;
  recurringGesture: string;
  emotionalSlipPattern: string;
  contradictionSignature: string;
  memoryResidueFlavor: string;
};

/** 情境差分：高魅力六人显式；普通 NPC 可由 core 派生默认句 */
export type NpcPersonalityScenarioMatrix = {
  firstContactStyle: string;
  probeStyle: string;
  demandStyle: string;
  truthAvoidanceStyle: string;
  angerStyle: string;
  protectStyle: string;
  intimacyWarmedStyle: string;
  crisisAuthenticReaction: string;
  protagonistResidueManifestation: string;
};

export type NpcCharmTier = "standard" | "major_charm";

/** 单回合可执行行为提示（短句，进 prompt） */
export type NpcHeartRuntimeBehavioralHints = {
  /** 本回合最自然的口吻/节奏 */
  speakThisRound: string;
  /** 推远或拉近玩家的惯用手法 */
  pushPullThisRound: string;
  /** 最容易露出的破绽/失态 */
  likelySlip: string;
  /** 明确禁止的扁平人设 */
  forbiddenCaricature: string;
  /** 单行密排（prompt 备用） */
  compactBehaviorLine: string;
};

export const PERSONALITY_CORE_KEYS = [
  "identityTension",
  "coreTemper",
  "emotionalDefenseStyle",
  "stressResponse",
  "intimacyResponse",
  "suspicionResponse",
  "truthEvasionStyle",
  "rescueInstinctStyle",
  "crueltyBoundary",
  "attachmentPattern",
  "selfImage",
  "shameTrigger",
  "controlNeed",
  "powerExpression",
  "speechCadence",
  "recurringGesture",
  "emotionalSlipPattern",
  "contradictionSignature",
  "memoryResidueFlavor",
] as const;

export const PERSONALITY_SCENARIO_KEYS = [
  "firstContactStyle",
  "probeStyle",
  "demandStyle",
  "truthAvoidanceStyle",
  "angerStyle",
  "protectStyle",
  "intimacyWarmedStyle",
  "crisisAuthenticReaction",
  "protagonistResidueManifestation",
] as const;
