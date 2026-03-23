import "server-only";

import { pool } from "@/db/index";
import { toPgVectorLiteral } from "./embed";

export type CacheScope = "global" | "user";

function isPgMissingObject(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code === "42P01" || code === "42704") return true;
  const cause = (err as { cause?: { code?: string } }).cause;
  if (cause && typeof cause === "object" && (cause.code === "42P01" || cause.code === "42704")) return true;
  const msg = String((err as Error).message ?? "");
  if (/type\s+"vector"\s+does\s+not\s+exist/i.test(msg)) return true;
  return false;
}

/** 单查询读取 world_revision；表缺失返回 0n（与未初始化等价）。 */
export async function getWorldRevision(): Promise<bigint> {
  let client;
  try {
    client = await pool.connect();
  } catch {
    return BigInt(0);
  }
  try {
    const r = await client.query<{ world_revision: string }>(
      `SELECT world_revision::text AS world_revision FROM vc_world_meta WHERE id = 1 LIMIT 1`
    );
    const row = r.rows[0];
    if (!row?.world_revision) return BigInt(0);
    try {
      return BigInt(row.world_revision);
    } catch {
      return BigInt(0);
    }
  } catch (e) {
    if (isPgMissingObject(e)) return BigInt(0);
    return BigInt(0);
  } finally {
    client.release();
  }
}

/**
 * 全局语义缓存查询：短事务内 SET LOCAL ivfflat.probes。
 * Pool max=10：务必保持单次连接、尽快释放。
 */
export async function tryGetSemanticCache(args: {
  scope: CacheScope;
  userId: string | null;
  task: "codex";
  queryEmbedding: number[];
  worldRevision: bigint;
  probes: number;
  k: number;
  minSimilarity: number;
}): Promise<{ hit: boolean; responseText?: string; cacheId?: number; similarity?: number }> {
  if (args.scope === "global" && args.userId !== null) {
    return { hit: false };
  }
  if (args.scope === "user" && !args.userId) {
    return { hit: false };
  }

  const vecLit = toPgVectorLiteral(args.queryEmbedding);
  let client;
  try {
    client = await pool.connect();
  } catch {
    return { hit: false };
  }
  try {
    await client.query("BEGIN");
    if (args.probes > 0) {
      const p = Math.min(1024, Math.max(1, Math.floor(args.probes)));
      await client.query(`SET LOCAL ivfflat.probes = $1`, [p]);
    }

    const k = Math.min(32, Math.max(1, Math.floor(args.k)));
    const wr = args.worldRevision.toString();

    if (args.scope === "global") {
      const sel = await client.query<{
        id: string;
        response_text: string;
        dist: string;
      }>(
        `
        SELECT id, response_text, (request_embedding <=> $1::vector)::text AS dist
        FROM vc_semantic_cache
        WHERE cache_scope = 'global'
          AND task = $2
          AND user_id IS NULL
          AND is_valid = true
          AND expires_at > NOW()
          AND world_revision = $3::bigint
        ORDER BY request_embedding <=> $1::vector
        LIMIT $4
        `,
        [vecLit, args.task, wr, k]
      );

      await client.query("COMMIT");

      for (const row of sel.rows) {
        const dist = Number(row.dist);
        if (!Number.isFinite(dist)) continue;
        const similarity = 1 - dist;
        if (similarity >= args.minSimilarity) {
          return {
            hit: true,
            responseText: row.response_text,
            cacheId: Number(row.id),
            similarity,
          };
        }
      }
      return { hit: false };
    }

    const uid = args.userId!;
    const selUser = await client.query<{
      id: string;
      response_text: string;
      dist: string;
    }>(
      `
      SELECT id, response_text, (request_embedding <=> $1::vector)::text AS dist
      FROM vc_semantic_cache
      WHERE cache_scope = 'user'
        AND task = $2
        AND user_id = $3
        AND is_valid = true
        AND expires_at > NOW()
        AND world_revision = $4::bigint
      ORDER BY request_embedding <=> $1::vector
      LIMIT $5
      `,
      [vecLit, args.task, uid, wr, k]
    );
    await client.query("COMMIT");
    for (const row of selUser.rows) {
      const dist = Number(row.dist);
      if (!Number.isFinite(dist)) continue;
      const similarity = 1 - dist;
      if (similarity >= args.minSimilarity) {
        return {
          hit: true,
          responseText: row.response_text,
          cacheId: Number(row.id),
          similarity,
        };
      }
    }
    return { hit: false };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (isPgMissingObject(e)) return { hit: false };
    return { hit: false };
  } finally {
    client.release();
  }
}

export async function putSemanticCache(args: {
  scope: CacheScope;
  userId: string | null;
  task: "codex";
  worldRevision: bigint;
  requestText: string;
  requestNorm: string;
  requestHash: string;
  requestEmbedding: number[];
  responseText: string;
  ttlSec: number;
}): Promise<void> {
  if (args.scope === "global") {
    if (args.userId !== null) return;
  } else {
    if (!args.userId) return;
  }

  const vecLit = toPgVectorLiteral(args.requestEmbedding);
  const ttl = Math.max(60, Math.min(86400 * 30, Math.floor(args.ttlSec)));
  const preview = args.requestText.slice(0, 500);
  const wr = args.worldRevision.toString();

  let client;
  try {
    client = await pool.connect();
  } catch {
    return;
  }
  try {
    if (args.scope === "global") {
      await client.query(
        `
        INSERT INTO vc_semantic_cache (
          cache_scope, task, user_id, world_revision, request_embedding,
          request_norm, request_text_preview, request_hash, response_text,
          is_valid, expires_at, hit_count, last_hit_at
        ) VALUES (
          'global', $1, NULL, $2::bigint, $3::vector,
          $4, $5, $6, $7,
          true, NOW() + ($8::bigint * interval '1 second'), 0, NULL
        )
        ON CONFLICT (request_hash) DO UPDATE SET
          world_revision = EXCLUDED.world_revision,
          request_embedding = EXCLUDED.request_embedding,
          request_norm = EXCLUDED.request_norm,
          request_text_preview = EXCLUDED.request_text_preview,
          response_text = EXCLUDED.response_text,
          is_valid = true,
          expires_at = EXCLUDED.expires_at,
          hit_count = vc_semantic_cache.hit_count
        `,
        [args.task, wr, vecLit, args.requestNorm, preview, args.requestHash, args.responseText, ttl]
      );
    } else if (args.userId) {
      await client.query(
        `
        INSERT INTO vc_semantic_cache (
          cache_scope, task, user_id, world_revision, request_embedding,
          request_norm, request_text_preview, request_hash, response_text,
          is_valid, expires_at, hit_count, last_hit_at
        ) VALUES (
          'user', $1, $2, $3::bigint, $4::vector,
          $5, $6, $7, $8,
          true, NOW() + ($9::bigint * interval '1 second'), 0, NULL
        )
        ON CONFLICT (request_hash) DO UPDATE SET
          world_revision = EXCLUDED.world_revision,
          request_embedding = EXCLUDED.request_embedding,
          request_norm = EXCLUDED.request_norm,
          request_text_preview = EXCLUDED.request_text_preview,
          response_text = EXCLUDED.response_text,
          is_valid = true,
          expires_at = EXCLUDED.expires_at,
          hit_count = vc_semantic_cache.hit_count
        `,
        [
          args.task,
          args.userId,
          wr,
          vecLit,
          args.requestNorm,
          preview,
          args.requestHash,
          args.responseText,
          ttl,
        ]
      );
    }
  } catch (e) {
    if (isPgMissingObject(e)) return;
  } finally {
    client.release();
  }
}

/** 命中后 best-effort 更新计数（失败不影响主链路）。 */
export async function touchSemanticCacheHit(cacheId: number): Promise<void> {
  if (!Number.isFinite(cacheId) || cacheId <= 0) return;
  let client;
  try {
    client = await pool.connect();
  } catch {
    return;
  }
  try {
    await client.query(
      `UPDATE vc_semantic_cache SET hit_count = hit_count + 1, last_hit_at = NOW() WHERE id = $1`,
      [String(cacheId)]
    );
  } catch (e) {
    if (isPgMissingObject(e)) return;
  } finally {
    client.release();
  }
}
