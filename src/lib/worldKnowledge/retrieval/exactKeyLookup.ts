/**
 * 精确键检索（exact/key lookup）骨架。
 *
 * 后续将从 PostgreSQL fact store 命中 factKey/normalized_hash。
 * 当前阶段只定义接口，返回空结果。
 */

import type { RetrievalCandidate, RetrievalQuery } from "../types";

export async function exactKeyLookup(_query: RetrievalQuery): Promise<RetrievalCandidate[]> {
  return [];
}

