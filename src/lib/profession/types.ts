import type { StatType } from "@/lib/registry/types";

export type ProfessionId = "守灯人" | "巡迹客" | "觅兆者" | "齐日角" | "溯源师";

/**
 * 职业认证闭环（克制版）
 *
 * 设计目标：
 * - 单职业制保留：一局只能正式认证一次，之后不可转职。
 * - 认证不再是“属性>20即标签”，必须同时满足：
 *   1) 基础属性门槛（身份底色）
 *   2) 行为证据（玩家确实在用对应风格玩）
 *   3) 试炼任务（轻量、可验证、可复述）
 * - VerseCraft 仍是规则怪谈叙事冒险：职业提供“窗口/倾向/协商能力”，不直接代打通关。
 */
export type ProfessionCertificationSpec = {
  /** 认证的主属性门槛（建议略低于 20，让“身份选择”更可达，但仍需要投入）。 */
  primaryStatMin: number;
  /** 行为证据需求条数（克制：建议 2~3）。 */
  behaviorEvidenceTarget: number;
  /** 认证试炼任务 ID（必须完成）。 */
  trialTaskId: string;
  /**
   * 认证 NPC（签发者）。
   * - 说明：真正的“遇到/在场/关系”裁决属于服务端与剧情链路；这里仅定义“谁签发”。
   */
  certifierNpcId: string;
};

export type ProfessionEvidenceKey =
  | "threat_suppression_window"
  | "threat_pressure_survival"
  | "mobility_progress"
  | "escape_discipline"
  | "omen_validation"
  | "anomaly_codex_work"
  | "negotiation_results"
  | "relationship_growth"
  | "forge_maintenance"
  | "weapon_discipline"
  | "truth_chain_progress";

export interface ProfessionProgress {
  statQualified: boolean;
  behaviorQualified: boolean;
  behaviorEvidenceCount: number;
  behaviorEvidenceTarget: number;
  /** 行为证据命中来源（用于 UI/调试；不影响硬裁决）。 */
  behaviorEvidenceKeys?: ProfessionEvidenceKey[];
  trialTaskId: string | null;
  trialTaskCompleted: boolean;
  certified: boolean;
}

export interface ProfessionStateV1 {
  currentProfession: ProfessionId | null;
  unlockedProfessions: ProfessionId[];
  eligibilityByProfession: Record<ProfessionId, boolean>;
  progressByProfession: Record<ProfessionId, ProfessionProgress>;
  activePerks: string[];
  professionFlags: Record<string, boolean>;
  professionCooldowns: Record<string, number>;
}

export interface ProfessionDefinition {
  id: ProfessionId;
  primaryStat: StatType;
  passivePerkId: string;
  activeSkillId: string | null;
  summary: string;
  certification: ProfessionCertificationSpec;
  /**
   * 职业定位（给 DM/系统包的“身份感”锚点）：
   * - 影响：任务、关系、锻造、调查、武器裁决的倾向联动（不等于直接加数值碾压）。
   */
  playstyle: {
    identityLine: string;
    weaponSynergy: string;
    taskSynergy: string;
    forgeSynergy: string;
    investigationSynergy: string;
    relationshipSynergy: string;
  };
}

