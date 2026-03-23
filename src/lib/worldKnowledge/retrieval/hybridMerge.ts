/**
 * 混合召回合并与去重骨架。
 *
 * - 去重：按 factKey / normalized_hash 合并
 * - 合并评分：简单求和或最大值（scaffold）
 */

import type { RetrievalCandidate } from "../types";

export function hybridMerge(candidates: RetrievalCandidate[][]): RetrievalCandidate[] {
  const byKey = new Map<string, RetrievalCandidate>();
  for (const group of candidates) {
    for (const c of group) {
      const key = c.fact.identity.factKey;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, c);
        continue;
      }
      // scaffold: 取最大分更稳定
      byKey.set(key, { ...prev, score: Math.max(prev.score, c.score) });
    }
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

