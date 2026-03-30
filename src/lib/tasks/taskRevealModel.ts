/**
 * 揭露/线索拉力（过程向）：高价值揭露应来自推进与检定，而非标题剧透。
 */

import { clampUnit } from "./taskRoleModel";

export function computeRevealPullScore(t: {
  revealValue?: number;
  clueGateWeight?: number;
  emotionalResidueValue?: number;
}): number {
  const rv = clampUnit(t.revealValue) ?? 0.42;
  const clue = clampUnit(t.clueGateWeight) ?? 0.32;
  const emo = clampUnit(t.emotionalResidueValue) ?? 0.2;
  return rv * 0.45 + clue * 0.35 + emo * 0.2;
}

/** promiseRisk 内排序：人物债与残响优先于纯系统风险标记 */
export function promiseRiskSortScore(t: {
  futureDebtValue?: number;
  emotionalResidueValue?: number;
  relationshipGateWeight?: number;
  highRiskHighReward?: boolean;
  canBackfire?: boolean;
}): number {
  const debt = clampUnit(t.futureDebtValue) ?? 0;
  const emo = clampUnit(t.emotionalResidueValue) ?? 0;
  const rel = clampUnit(t.relationshipGateWeight) ?? 0;
  let s = debt * 1.2 + emo * 1.05 + rel * 0.9;
  if (t.highRiskHighReward) s += 0.35;
  if (t.canBackfire) s += 0.25;
  return s;
}
