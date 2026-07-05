import type { ProfessionId, ProfessionProgress, ProfessionStateV1 } from "./types";
import { PROFESSION_IDS } from "./registry";

/**
 * 职业可见性策略（Phase-2）
 * - 不改变任务系统结构，只决定“哪些职业信息应在前台/提示词中露出”。
 * - 目标：让玩家看见“我正在靠近什么”，但避免厚重 RPG 树与刷屏。
 */

export type ProfessionVisibility = {
  visibleProfessions: ProfessionId[];
  showCertifierLine: boolean;
  showTrialLine: boolean;
};

function isTruthy(n: unknown): boolean {
  return Boolean(n);
}

/**
 * “更接近认证”的粗略排序分：只用于决定 2 条倾向展示谁优先，不影响 eligibility 硬裁决。
 * - 修复：旧实现按 PROFESSION_IDS 固定顺序取前 2 个满足条件的职业，导致展示总是偏向数组里靠前的
 *   职业（例如“守灯人/巡迹客”），而不是玩家实际投入最多的那两个。
 */
function proximityScore(p: ProfessionProgress): number {
  let score = (p.behaviorEvidenceCount ?? 0) * 2;
  if (p.statQualified) score += 1;
  if (p.observedByCertifier) score += 2;
  if (p.trialOffered) score += 3;
  if (p.trialAccepted) score += 2;
  return score;
}

export function computeProfessionVisibility(state: ProfessionStateV1): ProfessionVisibility {
  const current = state?.currentProfession ?? null;
  if (current) {
    return { visibleProfessions: [current], showCertifierLine: true, showTrialLine: true };
  }
  const candidates: Array<{ id: ProfessionId; score: number }> = [];
  for (const id of PROFESSION_IDS) {
    const p = state?.progressByProfession?.[id] as ProfessionProgress | undefined;
    if (!p) continue;
    if (isTruthy(p.inclinationVisible) || (p.behaviorEvidenceCount ?? 0) > 0 || isTruthy(p.observedByCertifier)) {
      candidates.push({ id, score: proximityScore(p) });
    }
  }
  // 按“更接近认证”排序（稳定排序，等分时保留注册表顺序作兜底），而不是固定数组顺序。
  candidates.sort((a, b) => b.score - a.score);
  // 克制：最多展示 2 条倾向，避免像职业树。
  return {
    visibleProfessions: candidates.slice(0, 2).map((c) => c.id),
    showCertifierLine: true,
    showTrialLine: true,
  };
}

