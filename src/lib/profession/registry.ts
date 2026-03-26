import type { ProfessionDefinition, ProfessionId, ProfessionStateV1 } from "./types";
import { getProfessionTrialTaskId } from "./trials";

export const PROFESSION_IDS: readonly ProfessionId[] = ["守灯人", "巡迹客", "觅兆者", "齐日角", "溯源师"] as const;

export const PROFESSION_REGISTRY: Record<ProfessionId, ProfessionDefinition> = {
  守灯人: {
    id: "守灯人",
    primaryStat: "sanity",
    passivePerkId: "perk.lampkeeper.threat_telegraph",
    activeSkillId: "skill.lampkeeper.steady_heart",
    summary: "在高压主威胁回合更擅长“看清窗口、稳住代价”，把危险压回可控区间。",
    certification: {
      primaryStatMin: 18,
      behaviorEvidenceTarget: 2,
      trialTaskId: getProfessionTrialTaskId("守灯人"),
      certifierNpcId: "N-008",
    },
    playstyle: {
      identityLine: "你学会在灯影里辨认压制窗口，而不是赌命硬闯。",
      weaponSynergy: "偏好稳定度高、污染可控的主手；强调“可靠性”与窗口推进。",
      taskSynergy: "更适合接“压制/守点/带回记录”的委托，而不是追求一次性爆发。",
      forgeSynergy: "更强调维护与修复，避免高污染故障在关键回合爆雷。",
      investigationSynergy: "以威胁相位与可验证记录为核心线索，减少无效探索。",
      relationshipSynergy: "通过稳定兑现承诺，换取NPC在高压回合的协助与通融。",
    },
  },
  巡迹客: {
    id: "巡迹客",
    primaryStat: "agility",
    passivePerkId: "perk.pathfinder.mobility_window",
    activeSkillId: "skill.pathfinder.quick_step",
    summary: "更擅长移动、撤离、换位与节奏控制，把“活着离开”当成第一战术。",
    certification: {
      primaryStatMin: 18,
      behaviorEvidenceTarget: 2,
      trialTaskId: getProfessionTrialTaskId("巡迹客"),
      certifierNpcId: "N-014",
    },
    playstyle: {
      identityLine: "你不是最快的人，而是最会留退路的人。",
      weaponSynergy: "偏好机动模组（如 grappling）与低耗工具化主手，强调撤离窗口。",
      taskSynergy: "更适合“穿行/带路/撤离样本”类任务，重视回合耗时与风险堆叠。",
      forgeSynergy: "改装优先于堆叠强力灌注，避免因污染导致撤离失败。",
      investigationSynergy: "调查以路径验证为主：先确认安全节点，再推进深处。",
      relationshipSynergy: "用行动兑现‘带你出去’的承诺，换取路线情报与协作。",
    },
  },
  觅兆者: {
    id: "觅兆者",
    primaryStat: "luck",
    passivePerkId: "perk.omenseeker.signal_pick",
    activeSkillId: "skill.omenseeker.omen_focus",
    summary: "更擅长识别前兆、验证弱点，把模糊恐惧拆成可操作的证据。",
    certification: {
      primaryStatMin: 18,
      behaviorEvidenceTarget: 2,
      trialTaskId: getProfessionTrialTaskId("觅兆者"),
      certifierNpcId: "N-008",
    },
    playstyle: {
      identityLine: "你不靠勇气取胜，你靠把未知变成已知。",
      weaponSynergy: "偏好短期灌注与标签匹配；用‘一次正确’换取窗口，而不是长期碾压。",
      taskSynergy: "更适合“前兆验证/弱点确认/情报带回”类委托。",
      forgeSynergy: "灌注与校准优先，但必须接受污染代价并安排维护回合。",
      investigationSynergy: "倾向把图鉴更新与主威胁反制线索绑定，形成可复述结论。",
      relationshipSynergy: "用准确情报做交换，而不是用情绪硬扛。",
    },
  },
  齐日角: {
    id: "齐日角",
    primaryStat: "charm",
    passivePerkId: "perk.sunhorn.dialogue_window",
    activeSkillId: "skill.sunhorn.bridge_words",
    summary: "更擅长交涉与委托分流，把敌意拉回可交易区间。",
    certification: {
      primaryStatMin: 18,
      behaviorEvidenceTarget: 2,
      trialTaskId: getProfessionTrialTaskId("齐日角"),
      certifierNpcId: "N-011",
    },
    playstyle: {
      identityLine: "你用言辞换取窗口，用承诺换取秩序。",
      weaponSynergy: "武器不是暴力答案，而是谈判筹码与威慑边界；强调‘错误使用会反噬’。",
      taskSynergy: "更适合“委托协商/关系修复/交易通融”类任务。",
      forgeSynergy: "可通过服务协商获得小幅折扣或额外一次维护机会（不触碰免费）。",
      investigationSynergy: "调查以‘谁愿意说、说到哪’为线索，不强行突破禁忌规则。",
      relationshipSynergy: "关系收益更稳定，但背叛/失信的代价也更明确。",
    },
  },
  溯源师: {
    id: "溯源师",
    primaryStat: "background",
    passivePerkId: "perk.traceorigin.forge_preference",
    activeSkillId: "skill.traceorigin.chain_audit",
    summary: "更擅长锻造、维护与线索链，把装备与真相当成同一条证据链。",
    certification: {
      primaryStatMin: 18,
      behaviorEvidenceTarget: 2,
      trialTaskId: getProfessionTrialTaskId("溯源师"),
      certifierNpcId: "N-008",
    },
    playstyle: {
      identityLine: "你把每一次修复都当成证据：谁用过、为何失效、代价是谁付的。",
      weaponSynergy: "强调污染/稳定的管理；更擅长把‘可靠性’转化为可预测窗口。",
      taskSynergy: "更适合“证据补全/断链修复/锻造记录”类委托。",
      forgeSynergy: "可获得结构化小额折扣倾向与更清晰的配方建议，但绝不白嫖高阶武器。",
      investigationSynergy: "调查以‘可验证链路’为核心，把图鉴线索串成行动建议。",
      relationshipSynergy: "用锻造与证据换取服务特权，而不是靠纯好感。",
    },
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
      守灯人: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: PROFESSION_REGISTRY.守灯人.certification.behaviorEvidenceTarget, trialTaskId: PROFESSION_REGISTRY.守灯人.certification.trialTaskId, trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
      巡迹客: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: PROFESSION_REGISTRY.巡迹客.certification.behaviorEvidenceTarget, trialTaskId: PROFESSION_REGISTRY.巡迹客.certification.trialTaskId, trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
      觅兆者: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: PROFESSION_REGISTRY.觅兆者.certification.behaviorEvidenceTarget, trialTaskId: PROFESSION_REGISTRY.觅兆者.certification.trialTaskId, trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
      齐日角: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: PROFESSION_REGISTRY.齐日角.certification.behaviorEvidenceTarget, trialTaskId: PROFESSION_REGISTRY.齐日角.certification.trialTaskId, trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
      溯源师: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: PROFESSION_REGISTRY.溯源师.certification.behaviorEvidenceTarget, trialTaskId: PROFESSION_REGISTRY.溯源师.certification.trialTaskId, trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
    },
    activePerks: [],
    professionFlags: {},
    professionCooldowns: {},
  };
}

