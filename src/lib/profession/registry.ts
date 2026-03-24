import type { ProfessionDefinition, ProfessionId, ProfessionStateV1 } from "./types";

export const PROFESSION_IDS: readonly ProfessionId[] = ["守灯人", "巡迹客", "觅兆者", "齐日角", "溯源师"] as const;

export const PROFESSION_REGISTRY: Record<ProfessionId, ProfessionDefinition> = {
  守灯人: {
    id: "守灯人",
    primaryStat: "sanity",
    passivePerkId: "perk.lampkeeper.threat_telegraph",
    activeSkillId: "skill.lampkeeper.steady_heart",
    summary: "强化主威胁识别与压制窗口判断，不替代战斗系统。",
  },
  巡迹客: {
    id: "巡迹客",
    primaryStat: "agility",
    passivePerkId: "perk.pathfinder.mobility_window",
    activeSkillId: "skill.pathfinder.quick_step",
    summary: "强化位移与撤离时机，不替代地图探索与风险决策。",
  },
  觅兆者: {
    id: "觅兆者",
    primaryStat: "luck",
    passivePerkId: "perk.omenseeker.signal_pick",
    activeSkillId: null,
    summary: "强化高价值信号捕捉，不替代资源循环与任务推进。",
  },
  齐日角: {
    id: "齐日角",
    primaryStat: "charm",
    passivePerkId: "perk.sunhorn.dialogue_window",
    activeSkillId: "skill.sunhorn.bridge_words",
    summary: "强化关系与委托窗口，不替代关系后果系统。",
  },
  溯源师: {
    id: "溯源师",
    primaryStat: "background",
    passivePerkId: "perk.traceorigin.forge_preference",
    activeSkillId: null,
    summary: "强化锻造与线索追溯偏好，不替代武器与锻造系统。",
  },
};

export function createDefaultProfessionState(): ProfessionStateV1 {
  return {
    currentProfession: null,
    unlockedProfessions: [],
    eligibilityByProfession: {
      守灯人: false,
      巡迹客: false,
      觅兆者: false,
      齐日角: false,
      溯源师: false,
    },
    progressByProfession: {
      守灯人: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "prof_trial_lampkeeper", trialTaskCompleted: false, certified: false },
      巡迹客: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "prof_trial_pathfinder", trialTaskCompleted: false, certified: false },
      觅兆者: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "prof_trial_omenseeker", trialTaskCompleted: false, certified: false },
      齐日角: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "prof_trial_sunhorn", trialTaskCompleted: false, certified: false },
      溯源师: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "prof_trial_traceorigin", trialTaskCompleted: false, certified: false },
    },
    activePerks: [],
    professionFlags: {},
    professionCooldowns: {},
  };
}

