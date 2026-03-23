/**
 * 向量检索骨架（pgvector / ivfflat）。
 *
 * 本阶段只定义接口：未来会查询 `vc_world_fact` 或新 fact store 表，并返回候选 facts。
 */

import type { RetrievalCandidate, RetrievalQuery } from "../types";

export async function vectorSearch(_query: RetrievalQuery): Promise<RetrievalCandidate[]> {
  return [];
}

