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
    passiveSummary: "高压主威胁回合中，你更容易获得“压制窗口/下一步代价”的明确提示；系统结算时，精神损耗-1（最低为0）。",
    activeSummary: "稳心定灯：在即将硬闯/压制的关键回合发动。下回合若遭受精神损耗，额外-1；并在窗口判定中给予更清晰的“可控/不可控”提示（不保证成功）。",
    activeCooldownHours: 8,
    appliesToSystems: ["main_threat_states", "suppression_windows", "sanity_damage"],
    excludesSystems: ["weapon_damage", "attribute_override", "threat_counter_bypass"],
  },
  巡迹客: {
    passiveSummary: "移动/撤离取向行动时，系统更倾向提供“低耗路线/退路优先级/回合风险堆叠”的建议。",
    activeSummary: "疾行断压：在跨节点移动前发动。下回合若发生合法跨节点移动，本回合不消耗时间（仍受主威胁相位约束）。",
    activeCooldownHours: 8,
    appliesToSystems: ["player_location", "consumes_time", "main_threat_states"],
    excludesSystems: ["threat_immunity", "free_unlimited_actions", "attribute_override"],
  },
  觅兆者: {
    passiveSummary: "当你做“前兆识别/弱点验证/异常对照”时，系统更倾向给出可验证的反制线索（仍可能不完整）。",
    activeSummary: "征兆聚焦：在你准备验证一条线索时发动。下回合若主威胁发生更新且本回合未写入反制提示，则系统补记1条“可验证 counter hint”（不等于直接破解）。",
    activeCooldownHours: 10,
    appliesToSystems: ["threat_telegraphs", "main_threat_states", "codex"],
    excludesSystems: ["auto_solve_threat", "full_auto_hint", "attribute_override"],
  },
  齐日角: {
    passiveSummary: "交涉场景中，系统更倾向提示“可软化敌意的关系路径/委托分流/服务协商入口”（不保证对方买账）。",
    activeSummary: "缓锋陈词：在高张力交涉回合发动。下回合关系更新中的正向好感增量+1（封顶100）；但不会逆转硬性禁忌规则。",
    activeCooldownHours: 10,
    appliesToSystems: ["relationship", "tasks", "dialogue_windows"],
    excludesSystems: ["force_persuade_all", "relationship_auto_win", "attribute_override"],
  },
  溯源师: {
    passiveSummary: "调查/锻造相关行动会优先关联图鉴、真相链与可验证证据，并更早提示“维护/修复/武器化”的代价结构。",
    activeSummary: "断链重组：在你准备回锻造台或补全证据链时发动。下回合新增 anomaly 图鉴可附带溯源注记，并为锻造预览补充一条“更稳妥的维护路径建议”（不触发免费）。",
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

export function getProfessionActiveSkillName(profession: ProfessionId | null): string {
  if (!profession) return "";
  // 更“酷”的短名：用于顶栏徽记与按钮文案，避免出现“发动职业主动”等系统措辞。
  const table: Record<ProfessionId, string> = {
    守灯人: "稳心定灯",
    巡迹客: "疾行断压",
    觅兆者: "征兆聚焦",
    齐日角: "缓锋陈词",
    溯源师: "断链重组",
  };
  return table[profession] ?? String(profession);
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

