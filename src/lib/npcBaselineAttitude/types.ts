/**
 * NPC 对玩家的世界观基础态度层（与动态关系值解耦，可叠加合并）。
 */

import type { NpcRelationStateV2 } from "@/lib/registry/types";

/** 世界观层：NPC 默认把玩家看成什么（先于好感波动） */
export type BaselineViewOfPlayerKind =
  | "intruded_student"
  | "displaced_student"
  | "suspicious_intruder"
  | "familiar_fragment_echo"
  | "knows_truth";

/**
 * 单 NPC 的完整 baseline（不含关系修正）；来自注册表特权 + 角色壳。
 */
export type NpcBaselineAttitude = {
  npcId: string;
  baselineViewOfPlayer: BaselineViewOfPlayerKind;
  baselineWarmth: number;
  baselineGuardedness: number;
  baselineSuspicion: number;
  baselineCuriosity: number;
  baselineProtectiveness: number;
  baselineDistance: number;
  greetingStyleRule: string;
  truthRevealRule: string;
  crisisResponseRule: string;
  shouldAskHowPlayerKnowsThis: boolean;
  shouldAvoidOverfamiliarity: boolean;
  allowedFamiliarityCeiling: number;
};

/**
 * baseline + 关系 + 场景压力后的有效态度（供叙事/DM）。
 */
export type NpcBaselineMerged = {
  npcId: string;
  /** 合并后：NPC 此刻把玩家看作什么 */
  effectiveViewOfPlayer: BaselineViewOfPlayerKind;
  warmth: number;
  guardedness: number;
  suspicion: number;
  curiosity: number;
  protectiveness: number;
  distance: number;
  /** 可否表现熟悉感（受 allowedFamiliarityCeiling 与特权约束） */
  canExpressFamiliarity: boolean;
  /** 必须避免的叙事错位 */
  avoidMisalignment: string[];
  /** 一句话合成提示（塞进 packet） */
  compactNarrativeHint: string;
  /** 对玩家怎么称呼、先事务还是先套近乎 */
  playerAddressCue: string;
  /** 本回合可执行的互动姿态：试探 / 提醒 / 回避 / 利用（短句，非剧情正文） */
  playerInteractionStanceCue: string;
  shouldAskHowPlayerKnowsThis: boolean;
  shouldAvoidOverfamiliarity: boolean;
  allowedFamiliarityCeiling: number;
};

export type NpcBaselineSceneContext = {
  locationId: string;
  hotThreatPresent: boolean;
  /** 与 reveal 门闸对齐；缺省 0 */
  maxRevealRank: number;
};

/** 注入运行时 JSON 的紧凑包 */
export type NpcPlayerBaselinePacket = {
  npcId: string;
  baselineViewOfPlayer: BaselineViewOfPlayerKind;
  mergedViewOfPlayer: BaselineViewOfPlayerKind;
  canShowFamiliarity: boolean;
  avoidMisalignment: string[];
  crisisResponseStyle: string;
  truthRevealCeiling: number;
  greetingStyleRule: string;
  truthRevealRule: string;
  playerAddressCue: string;
  playerInteractionStanceCue: string;
  /** 关系修正量（示意，0–1） */
  relationModHint: {
    trustDelta: number;
    fearDelta: number;
  };
  baselineVersusRelationNote: string;
};

export type MergeNpcBaselineInput = {
  baseline: NpcBaselineAttitude;
  relation: NpcRelationStateV2;
  scene: NpcBaselineSceneContext;
};
