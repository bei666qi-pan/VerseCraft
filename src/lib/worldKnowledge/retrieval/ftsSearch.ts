/**
 * 全文检索（FTS）骨架。
 *
 * 后续将用 PostgreSQL FTS（tsvector + rank）对 canonicalText 做召回。
 */

import type { RetrievalCandidate, RetrievalQuery } from "../types";

export async function ftsSearch(_query: RetrievalQuery): Promise<RetrievalCandidate[]> {
  return [];
}

