import { normalizeGameTaskDraft, type GameTaskV2 } from "@/lib/tasks/taskV2";
import type { ProfessionId } from "./types";

type TrialDef = {
  id: string;
  title: string;
  desc: string;
  issuerId: string;
  issuerName: string;
  floorTier: string;
  nextHint: string;
};

const PROF_TRIALS: Record<ProfessionId, TrialDef> = {
  守灯人: {
    id: "prof_trial_lampkeeper",
    title: "守灯认证：带回不熄记录",
    desc: "在高压场景保持精神稳定后，带回一份可验证记录并交给老刘。",
    issuerId: "N-008",
    issuerName: "电工老刘",
    floorTier: "1",
    nextHint: "在主威胁压制后返回B1汇报。",
  },
  巡迹客: {
    id: "prof_trial_pathfinder",
    title: "巡迹认证：低耗撤离样本",
    desc: "完成一次极限穿行并安全撤离，提交路径样本。",
    issuerId: "N-014",
    issuerName: "洗衣房阿姨",
    floorTier: "1",
    nextHint: "优先选择短窗口进出路线。",
  },
  觅兆者: {
    id: "prof_trial_omenseeker",
    title: "觅兆认证：前兆验证",
    desc: "识别并验证一条主威胁隐蔽前兆，形成可复述结论。",
    issuerId: "N-008",
    issuerName: "电工老刘",
    floorTier: "1",
    nextHint: "关注主威胁反制线索与图鉴变化。",
  },
  齐日角: {
    id: "prof_trial_sunhorn",
    title: "齐日角认证：敌意转圜",
    desc: "通过交涉把一次高敌意局面拉回可合作区间。",
    issuerId: "N-011",
    issuerName: "夜读老人",
    floorTier: "B1",
    nextHint: "优先处理关系张力最高的人物。",
  },
  溯源师: {
    id: "prof_trial_traceorigin",
    title: "溯源认证：断链补全",
    desc: "补齐一条断裂真相链的关键节点并提交证据。",
    issuerId: "N-008",
    issuerName: "电工老刘",
    floorTier: "1",
    nextHint: "结合锻造记录与图鉴线索进行溯源。",
  },
};

export function getProfessionTrialTaskId(profession: ProfessionId): string {
  return PROF_TRIALS[profession].id;
}

export function getProfessionTrialIssuer(profession: ProfessionId): {
  issuerId: string;
  issuerName: string;
} {
  return {
    issuerId: PROF_TRIALS[profession].issuerId,
    issuerName: PROF_TRIALS[profession].issuerName,
  };
}

export function buildProfessionTrialTask(profession: ProfessionId): GameTaskV2 {
  const def = PROF_TRIALS[profession];
  const task = normalizeGameTaskDraft({
    id: def.id,
    title: def.title,
    // 试炼任务必须“像某人要你证明一件事”，而不是冷冰冰 checklist。
    desc: def.desc,
    type: "character",
    issuerId: def.issuerId,
    issuerName: def.issuerName,
    floorTier: def.floorTier,
    guidanceLevel: "standard",
    status: "available",
    claimMode: "manual",
    nextHint: def.nextHint,
    worldConsequences: [`profession:trial:${profession}`],
    highRiskHighReward: false,
    // 叙事层：默认作为“口头约定/试作”，进入承诺/风险带，而非抢占主任务板中心。
    taskNarrativeLayer: "conversation_promise",
    goalKind: "promise",
    grantState: "narratively_offered",
    shouldBeFormalTask: true,
    shouldStayAsConversationPromise: true,
    issuerDemandStyle: "explicit",
    issuerPressureStyle: "mid",
    issuerTrustTestMode: "probe",
    issuerSoftRevealMode: "receipt",
    playerHook: "他要的不是漂亮话——是你做得到的证据。",
    riskNote: "别把试炼当成打卡；它会在关键回合反过来咬你。",
  });
  if (!task) {
    throw new Error(`invalid profession trial task: ${profession}`);
  }
  return task;
}

