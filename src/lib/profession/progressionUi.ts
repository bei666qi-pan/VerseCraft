import type { ProfessionId, ProfessionProgress, ProfessionStateV1 } from "./types";
import { PROFESSION_IDS, PROFESSION_REGISTRY } from "./registry";

export type ProfessionApproachSnapshot = {
  profession: ProfessionId;
  score: number;
  stage: "inclination" | "observed" | "trial" | "eligible" | "certified";
  why: string[];
  next: string[];
  certifierNpcId: string;
};

function pickStage(p: ProfessionProgress): ProfessionApproachSnapshot["stage"] {
  if (p.certified) return "certified";
  if (p.statQualified && p.behaviorQualified && p.trialTaskCompleted) return "eligible";
  if (p.trialAccepted || p.trialOffered) return "trial";
  if (p.observedByCertifier) return "observed";
  return "inclination";
}

function clampNonNeg(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return v < 0 ? 0 : v;
}

function buildWhy(p: ProfessionProgress): string[] {
  const out: string[] = [];
  if (p.statQualified) out.push("主属性门槛已达标");
  if ((p.behaviorEvidenceCount ?? 0) > 0) {
    out.push(`行为证据：${p.behaviorEvidenceCount}/${p.behaviorEvidenceTarget}`);
  }
  if (p.observedByCertifier) out.push("签发者已注意到你");
  if (p.trialOffered) out.push("已被要求做一次证明");
  if (p.trialAccepted) out.push("你已在故事里接下这件事");
  if (p.trialTaskCompleted) out.push("证明已完成（可追责）");
  return out;
}

function buildNext(p: ProfessionProgress): string[] {
  const out: string[] = [];
  if (!p.statQualified) out.push("补足主属性门槛（别靠运气糊过去）");
  if (!p.behaviorQualified) out.push("把玩法证据补齐（让系统有东西可验证）");
  if (p.trialTaskId && !p.trialOffered) out.push("先让签发者看见你（别急着开口要认证）");
  if (p.trialTaskId && p.trialOffered && !p.trialAccepted) out.push("把证明接下来（口头约定也算债）");
  if (p.trialTaskId && p.trialAccepted && !p.trialTaskCompleted) out.push("完成证明并带回可复述的证据");
  if (p.statQualified && p.behaviorQualified && p.trialTaskCompleted && !p.certified) out.push("回到签发者处完成正式认证");
  return out.slice(0, 4);
}

function scoreProgress(p: ProfessionProgress): number {
  // 轻量评分：用于“我更像哪个职业”的排序（不作为硬裁决）。
  let s = 0;
  if (p.inclinationVisible) s += 1;
  if (p.statQualified) s += 2;
  s += Math.min(3, clampNonNeg(p.behaviorEvidenceCount));
  if (p.observedByCertifier) s += 1.5;
  if (p.trialOffered) s += 1.5;
  if (p.trialAccepted) s += 1;
  if (p.trialTaskCompleted) s += 3;
  if (p.certified) s += 6;
  if (p.identityImprinted) s += 1.5;
  return s;
}

export function buildProfessionApproachSnapshots(state: ProfessionStateV1): ProfessionApproachSnapshot[] {
  const st = state ?? ({} as ProfessionStateV1);
  return PROFESSION_IDS.map((id) => {
    const p = st.progressByProfession?.[id] as ProfessionProgress | undefined;
    const safe: ProfessionProgress = p ?? {
      statQualified: false,
      behaviorQualified: false,
      behaviorEvidenceCount: 0,
      behaviorEvidenceTarget: 2,
      behaviorEvidenceKeys: [],
      trialTaskId: null,
      trialTaskCompleted: false,
      certified: false,
    };
    const score = scoreProgress(safe);
    return {
      profession: id,
      score,
      stage: pickStage(safe),
      why: buildWhy(safe),
      next: buildNext(safe),
      certifierNpcId: PROFESSION_REGISTRY[id].certification.certifierNpcId,
    };
  }).sort((a, b) => b.score - a.score);
}

export function buildProfessionIdentityDigest(state: ProfessionStateV1): string {
  const current = state?.currentProfession ?? null;
  const top = buildProfessionApproachSnapshots(state)[0];
  if (current) {
    const def = PROFESSION_REGISTRY[current];
    const prog = state.progressByProfession?.[current];
    const badge = prog?.identityImprinted ? "（已留痕）" : "";
    return [
      `职业身份：${current}${badge}`,
      `定位：${def.playstyle.identityLine}`,
      `协同：任务[${def.playstyle.taskSynergy}]；武器[${def.playstyle.weaponSynergy}]；锻造[${def.playstyle.forgeSynergy}]；调查[${def.playstyle.investigationSynergy}]；关系[${def.playstyle.relationshipSynergy}]`,
    ].join("\n");
  }
  if (!top) return "职业倾向：未显露";
  const def = PROFESSION_REGISTRY[top.profession];
  const next = top.next.length > 0 ? `下一步：${top.next.join("；")}` : "";
  const seen = top.stage === "observed" || top.stage === "trial" || top.stage === "eligible" ? `签发者：${top.certifierNpcId}` : "";
  return [
    `职业倾向：更像「${top.profession}」`,
    `定位：${def.playstyle.identityLine}`,
    seen,
    next,
  ].filter(Boolean).join("\n");
}

