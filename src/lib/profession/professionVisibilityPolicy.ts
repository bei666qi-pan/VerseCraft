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

export function computeProfessionVisibility(state: ProfessionStateV1): ProfessionVisibility {
  const current = state?.currentProfession ?? null;
  if (current) {
    return { visibleProfessions: [current], showCertifierLine: true, showTrialLine: true };
  }
  const vis: ProfessionId[] = [];
  for (const id of PROFESSION_IDS) {
    const p = state?.progressByProfession?.[id] as ProfessionProgress | undefined;
    if (!p) continue;
    if (isTruthy(p.inclinationVisible) || (p.behaviorEvidenceCount ?? 0) > 0 || isTruthy(p.observedByCertifier)) {
      vis.push(id);
    }
  }
  // 克制：最多展示 2 条倾向，避免像职业树。
  return { visibleProfessions: vis.slice(0, 2), showCertifierLine: true, showTrialLine: true };
}

