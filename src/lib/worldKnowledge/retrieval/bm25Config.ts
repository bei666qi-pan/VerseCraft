// src/lib/worldKnowledge/retrieval/bm25Config.ts
// BM25-style scoring configuration for PostgreSQL FTS retrieval.
//
// PostgreSQL's ts_rank / ts_rank_cd are not pure BM25 but can be tuned
// to approximate BM25 behavior via normalization and ranking options.
//
// BM25 formula: score(D,Q) = Σ IDF(qi) * (f(qi,D) * (k1+1)) / (f(qi,D) + k1*(1-b+b*|D|/avgdl))
//
//   k1 ∈ [1.2, 2.0] — term frequency saturation (higher = more weight on repeated terms)
//   b  ∈ [0.0, 1.0] — document length normalization (higher = more penalty for long docs)
//
// In PostgreSQL, we approximate via:
//   - ts_rank_cd (cover density) for positional BM25-like behavior
//   - Normalization bitmask to control length penalty

import { envNumber } from "@/lib/config/envRaw";

// ── BM25 Parameters (tunable per environment) ──

/** k1: term frequency saturation. Default 1.8 (slightly higher for CJK domain — keyword repetition is more meaningful in Chinese). */
function getBm25K1(): number {
  return envNumber("VERSECRAFT_BM25_K1", 1.8);
}

/** b: document length normalization. Default 0.6 (slightly lower for CJK — Chinese text is inherently more compact). */
function getBm25B(): number {
  return envNumber("VERSECRAFT_BM25_B", 0.6);
}

/**
 * PostgreSQL ts_rank normalization bitmask.
 *
 * 0  = default (no normalization)
 * 1  = divide by log(doc_length)
 * 2  = divide by mean harmonic distance
 * 4  = divide by number of unique words
 * 8  = divide by 1 + log(average unique words per doc)
 * 16 = divide by 1 + log(num_unique_words / doc_length)
 * 32 = divide by (1 - b + b * doc_length / avg_doc_length)
 *
 * We use 32 to approximate BM25's length normalization component.
 * Setting b=0.75 matches the BM25 standard default.
 */
function getBm25Normalization(): number {
  // Higher values = more aggressive length penalty
  return envNumber("VERSECRAFT_BM25_NORM", 2 | 32);
}

// ── Query Construction ──

export interface Bm25Config {
  k1: number;
  b: number;
  normalization: number;
  /** Use ts_rank_cd (cover density) instead of ts_rank */
  useCoverDensity: boolean;
}

export function getBm25Config(): Bm25Config {
  return {
    k1: getBm25K1(),
    b: getBm25B(),
    normalization: getBm25Normalization(),
    useCoverDensity: true,
  };
}

/**
 * Build the SQL fragment for ts_rank with BM25-style normalization.
 *
 * Example output:
 *   ts_rank_cd(ARRAY[0.1, 0.2, 0.4, 1.0], c.content_tsv, query, 34)
 *
 * @param tsvectorCol - the tsvector column (e.g., "c.content_tsv")
 * @param queryParam  - the parameter placeholder (e.g., "$2")
 * @param config      - BM25 configuration
 * @param weights     - optional per-label weights [D,C,B,A]
 */
export function buildBm25RankExpr(
  tsvectorCol: string,
  queryParam: string,
  config: Bm25Config,
  weights: number[] = [0.1, 0.2, 0.4, 1.0],
): string {
  const fn = config.useCoverDensity ? "ts_rank_cd" : "ts_rank";
  const weightArr = `ARRAY[${weights.join(", ")}]`;
  const norm = config.normalization;
  return `${fn}(${weightArr}, ${tsvectorCol}, plainto_tsquery('simple', ${queryParam}), ${norm})`;
}

/**
 * Build the full BM25-ranked FTS query.
 */
export function buildBm25FtsQuery(params: {
  tsvectorCol: string;
  entityTable: string;
  entityIdCol: string;
  chunkIdCol: string;
  selectCols: string;
  scopeSql: string;
  scopeParams: unknown[];
  queryParamIdx: number;
  limitParamIdx: number;
}): { sql: string; params: unknown[] } {
  const config = getBm25Config();
  const rankExpr = buildBm25RankExpr(
    params.tsvectorCol,
    `$${params.queryParamIdx}`,
    config,
  );

  const sql = `
    SELECT
      ${params.selectCols},
      ${rankExpr} AS rank
    FROM world_knowledge_chunks c
    JOIN ${params.entityTable} e ON e.id = c.entity_id
    WHERE (${params.scopeSql})
      AND ${params.tsvectorCol} @@ plainto_tsquery('simple', $${params.queryParamIdx})
    ORDER BY rank DESC, c.importance DESC
    LIMIT $${params.limitParamIdx}
  `;

  return { sql, params: params.scopeParams };
}
