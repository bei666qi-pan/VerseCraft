/**
 * 世界知识向量化 batch worker（T4，2026-07）。
 *
 * 扫描 `world_knowledge_chunks` 里 `embedding_status = 'pending'` 的 chunk，调用
 * embeddings 网关（`src/lib/ai/embeddings/embedText.ts`，复用 AI_GATEWAY_* 凭证）生成向量，
 * 写回 `embedding_vector` + `embedding_status='ready'`（失败则标记 `embedding_status='error'`，
 * 不阻塞下一轮，不重试风暴）。
 *
 * 离线运行，不进入 `/api/chat` 首包路径（CLAUDE.md 8.3 worker 边界）。
 *
 * 用法：
 *   pnpm embeddings:backfill          # 循环跑到没有 pending 为止
 *   pnpm embeddings:backfill --once   # 只跑一批（默认 batchSize=20）
 *   pnpm embeddings:backfill --dry-run
 */
import { ensureRuntimeSchema } from "@/db/ensureSchema";
import { pool } from "@/db/index";
import { embedText } from "@/lib/ai/embeddings/embedText";
import { resolveEmbeddingBinding } from "@/lib/ai/config/env";

const BATCH_SIZE = 20;

function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

async function processBatch(dryRun: boolean): Promise<{ processed: number; ready: number; errored: number }> {
  const client = await pool.connect();
  try {
    const pendingRes = await client.query<{ id: number; content: string }>(
      `SELECT id, content FROM world_knowledge_chunks WHERE embedding_status = 'pending' ORDER BY id ASC LIMIT $1`,
      [BATCH_SIZE]
    );
    let ready = 0;
    let errored = 0;
    for (const row of pendingRes.rows) {
      const result = await embedText(row.content);
      if (!result.ok) {
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            stage: "embedding-backfill:skip",
            chunkId: row.id,
            reason: result.reason,
          })
        );
        if (!dryRun) {
          await client.query(`UPDATE world_knowledge_chunks SET embedding_status = 'error' WHERE id = $1`, [row.id]);
        }
        errored += 1;
        continue;
      }
      if (!dryRun) {
        try {
          await client.query(
            `UPDATE world_knowledge_chunks
             SET embedding_vector = $1::vector, embedding_model = $2, embedding_status = 'ready'
             WHERE id = $3`,
            [toPgVectorLiteral(result.vector), result.model, row.id]
          );
        } catch (err) {
          // pgvector 未安装时 embedding_vector 是 TEXT 列，`::vector` 转型会报错——
          // 退化为把向量当字符串存（仍然是 pending→error，因为向量检索用不了它）。
          console.error(
            JSON.stringify({
              ts: new Date().toISOString(),
              stage: "embedding-backfill:write-failed",
              chunkId: row.id,
              message: err instanceof Error ? err.message : String(err),
            })
          );
          await client.query(`UPDATE world_knowledge_chunks SET embedding_status = 'error' WHERE id = $1`, [row.id]);
          errored += 1;
          continue;
        }
      }
      ready += 1;
    }
    return { processed: pendingRes.rows.length, ready, errored };
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const dryRun = process.argv.includes("--dry-run");

  const binding = resolveEmbeddingBinding();
  if (!binding.configured) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        stage: "embedding-backfill:not-configured",
        message:
          "AI_MODEL_EMBEDDING / AI_GATEWAY_BASE_URL / AI_GATEWAY_API_KEY 未齐全，无法生成向量。见 .env.example 的 embeddings 段落。",
      })
    );
    process.exitCode = 1;
    return;
  }

  await ensureRuntimeSchema();

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      stage: "embedding-backfill:start",
      once,
      dryRun,
      model: binding.model,
      dimension: binding.dimension,
    })
  );

  let totalProcessed = 0;
  for (;;) {
    const { processed, ready, errored } = await processBatch(dryRun);
    totalProcessed += processed;
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        stage: "embedding-backfill:batch",
        processed,
        ready,
        errored,
        totalProcessed,
      })
    );
    if (processed === 0 || once) break;
  }

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      stage: "embedding-backfill:done",
      totalProcessed,
    })
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        stage: "embedding-backfill:fatal",
        message: error instanceof Error ? error.message : String(error),
      })
    );
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end().catch(() => {});
  });
