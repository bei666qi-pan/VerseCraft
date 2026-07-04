/**
 * 向量检索真实实现（pgvector / ivfflat），T4（2026-07）。
 *
 * 前提与降级：`world_knowledge_chunks.embedding_vector` 只有在数据库装了 pgvector 扩展时
 * 才是真正的 `vector(256)` 列（见 `src/db/ensureSchema.ts` 的 `to_regtype('vector')` 探测），
 * 否则退化为 TEXT。本函数不重复做一次探测查询（会多打一次 DB round trip），而是直接尝试
 * `<=>` 向量距离查询，若数据库层因列类型不支持该操作符而报错，捕获后按"向量层不可用"
 * 处理、返回空数组——与仓库既有的"分层检索 + 优雅降级"哲学一致（FTS/tag/exact 三层仍会正常工作）。
 *
 * 调用方必须已经算好 `query.vectorQuery.embedding`（本文件不负责调用 embeddings 网关；
 * 该职责在 `src/lib/ai/embeddings/embedText.ts`，由调用方按需决定是否要为这次检索请求
 * 承担一次在线 embeddings 网络往返，见 `retrieveWorldKnowledge.ts` 里 `AI_ENABLE_WORLD_VECTOR_RETRIEVAL`
 * 开关处的调用方式）。
 */

import type { RetrievalCandidate, RetrievalQuery } from "../types";

type VectorChunkRow = {
  chunk_id: number;
  entity_id: number;
  code: string;
  canonical_name: string;
  entity_type: string;
  chunk_index: number;
  content: string;
  chunk_importance: number;
  visibility_scope: string;
  distance: number;
};

function toPgVectorLiteral(embedding: number[]): string {
  // pgvector 的文本输入格式：'[0.1,0.2,...]'
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

function mapRowToCandidate(row: VectorChunkRow): RetrievalCandidate {
  const similarity = Math.max(0, 1 - row.distance);
  return {
    fact: {
      identity: { factKey: `${row.code}:chunk:${row.chunk_index}` },
      layer:
        row.visibility_scope === "session"
          ? "session_ephemeral_facts"
          : row.visibility_scope === "user"
            ? "user_private_lore"
            : "shared_public_lore",
      factType: (row.entity_type === "truth" ? "world_mechanism" : row.entity_type) as RetrievalCandidate["fact"]["factType"],
      canonicalText: row.content,
      normalizedHash: `${row.code}:chunk:${row.chunk_index}`,
      tags: [row.entity_type, row.code, row.canonical_name],
      source: { kind: "db", entityId: String(row.entity_id) },
      isHot: row.chunk_importance >= 80,
    },
    score: Math.round(similarity * 100),
    debug: { from: "vector", similarity },
  };
}

/**
 * 用预先算好的 query embedding 做 pgvector 余弦相似度检索。
 * 任何失败（pgvector 不可用 / 查询超时 / 参数错误）一律返回 []，不抛出。
 *
 * 只依赖 `vectorQuery` 字段（`Pick`，而非完整 `RetrievalQuery`），这样 `retrieveWorldKnowledge.ts`
 * （用 `RuntimeLoreRequest`/`RetrievalPlan`，不是 `RetrievalQuery`）也能直接传一个临时对象调用，
 * 不需要伪造一份完整的 `RetrievalQuery`。
 */
export async function vectorSearch(query: Pick<RetrievalQuery, "vectorQuery">): Promise<RetrievalCandidate[]> {
  const vq = query.vectorQuery;
  if (!vq || !Array.isArray(vq.embedding) || vq.embedding.length === 0) return [];

  const minSimilarity = typeof vq.minSimilarity === "number" ? vq.minSimilarity : 0.5;
  const maxDistance = Math.max(0, Math.min(2, 1 - minSimilarity));
  const topK = 8;

  try {
    const { pool } = await import("@/db");
    const client = await pool.connect();
    try {
      const literal = toPgVectorLiteral(vq.embedding);
      const ret = await client.query<VectorChunkRow>(
        `
          SELECT
            c.id AS chunk_id, c.entity_id, e.code, e.canonical_name, e.entity_type,
            c.chunk_index, c.content, c.importance AS chunk_importance, c.visibility_scope,
            (c.embedding_vector <=> $1::vector) AS distance
          FROM world_knowledge_chunks c
          JOIN world_entities e ON e.id = c.entity_id
          WHERE c.embedding_status = 'ready'
            AND c.embedding_vector IS NOT NULL
          ORDER BY c.embedding_vector <=> $1::vector
          LIMIT $2
        `,
        [literal, topK]
      );
      return ret.rows.filter((r) => r.distance <= maxDistance).map(mapRowToCandidate);
    } finally {
      client.release();
    }
  } catch {
    // pgvector 未安装 / embedding_vector 仍是 TEXT 降级列 / 查询超时等，一律静默降级为空。
    return [];
  }
}
