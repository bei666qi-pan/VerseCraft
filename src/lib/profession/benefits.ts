import type { ProfessionId } from "./types";

export type ProfessionBenefitV1 = {
  passiveSummary: string;
  activeSummary: string | null;
  activeCooldownHours: number;
  appliesToSystems: string[];
  excludesSystems: string[];
};

export type ProfessionReadinessInput = {
  location: string;
  hasHotThreat: boolean;
  activeTasksCount: number;
  relationshipUpdatable: boolean;
  hasAnomalyCodex: boolean;
};

export type ProfessionReadiness = {
  hitRate: number;
  hint: string;
};

export const PROFESSION_BENEFITS_V1: Record<ProfessionId, ProfessionBenefitV1> = {
  守灯人: {
    passiveSummary: "高压主威胁场景下，精神损耗结算-1（最低为0）。",
    activeSummary: "稳心定灯：下回合若遭受精神损耗，额外-1并保留压制判断窗口提示。",
    activeCooldownHours: 8,
    appliesToSystems: ["main_threat_states", "suppression_windows", "sanity_damage"],
    excludesSystems: ["weapon_damage", "attribute_override", "threat_counter_bypass"],
  },
  巡迹客: {
    passiveSummary: "移动/撤离取向行动时，战术包优先输出低耗路径与退路优先级。",
    activeSummary: "疾行断压：下回合若发生合法跨节点移动，本回合不消耗时间。",
    activeCooldownHours: 8,
    appliesToSystems: ["player_location", "consumes_time", "main_threat_states"],
    excludesSystems: ["threat_immunity", "free_unlimited_actions", "attribute_override"],
  },
  觅兆者: {
    passiveSummary: "前兆/弱点相关行动会获得更明确的反制线索提示。",
    activeSummary: "征兆聚焦：下回合主威胁更新自动补记1条counter hint（若本回合未写入）。",
    activeCooldownHours: 10,
    appliesToSystems: ["threat_telegraphs", "main_threat_states", "codex"],
    excludesSystems: ["auto_solve_threat", "full_auto_hint", "attribute_override"],
  },
  齐日角: {
    passiveSummary: "交涉场景中优先提示可软化敌意的关系路径与任务分流。",
    activeSummary: "缓锋陈词：下回合关系更新中的正向好感增量+1（封顶100）。",
    activeCooldownHours: 10,
    appliesToSystems: ["relationship", "tasks", "dialogue_windows"],
    excludesSystems: ["force_persuade_all", "relationship_auto_win", "attribute_override"],
  },
  溯源师: {
    passiveSummary: "调查/锻造相关行动会优先关联图鉴、真相链与可验证证据。",
    activeSummary: "断链重组：下回合新增 anomaly 图鉴可附带溯源注记。",
    activeCooldownHours: 12,
    appliesToSystems: ["codex", "truths", "forge", "weapon"],
    excludesSystems: ["truth_full_unlock", "forge_free_upgrade", "attribute_override"],
  },
};

export function getProfessionPassiveSummary(profession: ProfessionId | null): string {
  if (!profession) return "无";
  return PROFESSION_BENEFITS_V1[profession].passiveSummary;
}

export function getProfessionActiveSummary(profession: ProfessionId | null): string {
  if (!profession) return "无";
  return PROFESSION_BENEFITS_V1[profession].activeSummary ?? "无";
}

export function getProfessionActiveCooldownHours(profession: ProfessionId | null): number {
  if (!profession) return 0;
  return PROFESSION_BENEFITS_V1[profession].activeCooldownHours;
}

export function getProfessionActiveFlagKey(profession: ProfessionId): string {
  return `profession.active.pending.${profession}`;
}

export function getProfessionActiveCooldownKey(profession: ProfessionId): string {
  return `profession.active.cooldown.${profession}`;
}

export function evaluateProfessionActiveReadiness(
  profession: ProfessionId | null,
  input: ProfessionReadinessInput
): ProfessionReadiness {
  if (!profession) return { hitRate: 0, hint: "未认证职业，无主动可用。" };
  if (profession === "守灯人") {
    const hitRate = input.hasHotThreat ? 85 : 35;
    return { hitRate, hint: input.hasHotThreat ? "当前高压威胁存在，主动收益较高。" : "建议在高压相位前保留主动。" };
  }
  if (profession === "巡迹客") {
    const movingScene = !input.location.startsWith("B1_");
    const hitRate = movingScene ? 80 : 45;
    return { hitRate, hint: movingScene ? "当前处于高风险楼层，主动更易命中。": "建议在跨节点移动前再发动。" };
  }
  if (profession === "觅兆者") {
    const hitRate = input.hasHotThreat ? 78 : 55;
    return { hitRate, hint: "建议本回合优先做前兆识别与弱点验证动作。" };
  }
  if (profession === "齐日角") {
    const hitRate = input.relationshipUpdatable ? 82 : 40;
    return { hitRate, hint: input.relationshipUpdatable ? "当前存在关系可更新对象，主动收益较高。" : "建议在交涉/关系回合使用主动。" };
  }
  const hitRate = input.hasAnomalyCodex || input.activeTasksCount > 0 ? 76 : 42;
  return { hitRate, hint: "建议在调查/图鉴更新回合使用主动，便于触发溯源注记。" };
}

