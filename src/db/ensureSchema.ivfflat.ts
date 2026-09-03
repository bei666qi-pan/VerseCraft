// src/db/ensureSchema.ivfflat.ts
// Helper extracted from ensureSchema.ts so it can be unit-tested without importing
// the server-only entry point. See ISSUE-002 (live production heartbeat noise:
// "column cannot have more than 2000 dimensions for ivfflat index").

export const PG_VECTOR_IVFFLAT_MAX_DIMENSIONS = 2000;

export function parsePgVectorDimension(typeName: string): number | null {
  const match = /^vector\((\d+)\)$/i.exec(String(typeName ?? "").trim());
  if (!match) return null;
  const dimension = Number(match[1]);
  return Number.isSafeInteger(dimension) && dimension > 0 ? dimension : null;
}

export function buildWorldKnowledgeChunksIvfflatIndexSql(dimension: number): string | null {
  if (!Number.isFinite(dimension) || dimension <= 0) {
    throw new Error(`world_knowledge_chunks ivfflat: invalid dimension ${dimension}`);
  }
  if (dimension > PG_VECTOR_IVFFLAT_MAX_DIMENSIONS) {
    // pgvector 的 hnsw 也只到 4000 维，超过我们直接放弃索引（向量查询退化为顺序扫描），
    // 至少比 heartbeat 每秒 ERROR 噪声要好。等未来 hnsw 升级 / 切到更小维度再恢复。
    return null;
  }
  return `
    CREATE INDEX IF NOT EXISTS world_knowledge_chunks_embedding_ivfflat
    ON world_knowledge_chunks USING ivfflat (embedding_vector vector_cosine_ops)
    WITH (lists = 100)
    WHERE embedding_vector IS NOT NULL AND embedding_status = 'ready';
  `;
}
