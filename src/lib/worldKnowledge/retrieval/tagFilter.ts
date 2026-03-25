/**
 * 标签过滤骨架（tag filter）。
 *
 * 后续会在多个候选集合之间进行：
 * - desiredFactTypes / desiredLayers
 * - tags whitelist / blacklist
 * 的过滤与微调。
 */

import type { LoreFact, RetrievalCandidate, RetrievalQuery } from "../types";

export function filterByTags(
  candidates: RetrievalCandidate[],
  query: RetrievalQuery
): RetrievalCandidate[] {
  void query;
  // scaffold: 暂不做过滤逻辑
  return candidates;
}

export function filterFactsByTags(facts: LoreFact[], tags: string[]): LoreFact[] {
  void tags;
  // scaffold
  return facts;
}

