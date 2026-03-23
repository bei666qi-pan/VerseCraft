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
  _query: RetrievalQuery
): RetrievalCandidate[] {
  // scaffold: 暂不做过滤逻辑
  return candidates;
}

export function filterFactsByTags(_facts: LoreFact[], _tags: string[]): LoreFact[] {
  // scaffold
  return _facts;
}

