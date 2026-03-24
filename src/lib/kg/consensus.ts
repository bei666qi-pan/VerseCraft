import "server-only";

import type { PoolClient } from "pg";
import { pool } from "@/db/index";
import { VC_EMBED_DIM, embedText, toPgVectorLiteral } from "./embed";
import { normalizeForHash, sha256Hex } from "./normalize";

const DEFAULT_PROBES = 5;
const DEFAULT_NEIGHBOR_K = 12;

/** 余弦相似度 >= 此值视为同簇（对应 distance <= 1 - threshold）。 */
export function consensusMinSimilarity(): number {
  const raw = process.env.VC_CONSENSUS_MIN_SIMILARITY;
  if (raw == null || raw === "") return 0.85;
  const x = Number(raw);
  if (!Number.isFinite(x) || x <= 0 || x > 1) return 0.85;
  return x;
}

function l2Normalize(vec: number[]): number[] {
  let s = 0;
  for (const x of vec) s += x * x;
  const n = Math.sqrt(s);
  if (n === 0 || !Number.isFinite(n)) return new Array(VC_EMBED_DIM).fill(0);
  return vec.map((x) => x / n);
}

function parseVectorLiteral(s: string): number[] | null {
  const t = s.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return null;
  const inner = t.slice(1, -1);
  if (!inner.trim()) return null;
  const parts = inner.split(",");
  if (parts.length !== VC_EMBED_DIM) return null;
  const out: number[] = [];
  for (const p of parts) {
    const x = Number(p.trim());
    if (!Number.isFinite(x)) return null;
    out.push(x);
  }
  return out;
}

function meanEmbeddings(vectors: number[][]): number[] {
  const acc = new Array(VC_EMBED_DIM).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < VC_EMBED_DIM; i++) acc[i] += v[i] ?? 0;
  }
  const n = vectors.length;
  if (n === 0) return acc;
  return acc.map((x) => x / n);
}

async function refreshClusterCentroid(client: PoolClient, clusterId: number): Promise<void> {
  const r = await client.query<{ embedding: string }>(
    `SELECT embedding::text AS embedding FROM vc_cluster_observation WHERE cluster_id = $1`,
    [String(clusterId)]
  );
  const vecs: number[][] = [];
  for (const row of r.rows) {
    const v = parseVectorLiteral(row.embedding);
    if (v) vecs.push(v);
  }
  if (vecs.length === 0) return;
  const centroid = l2Normalize(meanEmbeddings(vecs));
  await client.query(`UPDATE vc_world_cluster SET centroid = $1::vector, updated_at = NOW() WHERE cluster_id = $2`, [
    toPgVectorLiteral(centroid),
    String(clusterId),
  ]);
}

/**
 * 三人唯一用户 + 向量相似度门控；晋升写入 vc_world_fact 并 bump world_revision（新 fact 时）。
 */
export async function runConsensusForCandidate(args: { candidateId: number; requestId: string }): Promise<void> {
  const minSim = consensusMinSimilarity();
  const maxDist = 1 - minSim;

  const read = await pool.connect();
  let candidate: {
    id: string;
    body: string;
    proposer_user_id: string | null;
    canonical_text: string | null;
    embedding: string | null;
    janitor_status: string | null;
    janitor_action: string | null;
    compliance_ok: boolean | null;
  } | null = null;
  try {
    const r = await read.query<{
      id: string;
      body: string;
      proposer_user_id: string | null;
      canonical_text: string | null;
      embedding: string | null;
      janitor_status: string | null;
      janitor_action: string | null;
      compliance_ok: boolean | null;
    }>(
      `SELECT id, body, proposer_user_id, canonical_text, embedding::text AS embedding,
              janitor_status, janitor_action, compliance_ok
       FROM vc_world_candidate WHERE id = $1 LIMIT 1`,
      [String(args.candidateId)]
    );
    candidate = r.rows[0] ?? null;
  } finally {
    read.release();
  }

  if (!candidate) throw new Error("candidate_not_found");
  if (candidate.janitor_status !== "done" || candidate.janitor_action !== "enter_consensus" || !candidate.compliance_ok) {
    throw new Error("candidate_not_eligible_for_consensus");
  }
  if (!candidate.proposer_user_id) {
    throw new Error("candidate_missing_proposer");
  }

  const canon = (candidate.canonical_text ?? candidate.body).trim();
  if (!canon) throw new Error("candidate_empty_canon");

  let vec: number[];
  if (candidate.embedding) {
    const parsed = parseVectorLiteral(candidate.embedding);
    vec = parsed ?? embedText(canon);
  } else {
    vec = embedText(canon);
  }
  const vecLit = toPgVectorLiteral(vec);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ivfflat.probes = $1`, [DEFAULT_PROBES]);

    const near = await client.query<{ cluster_id: string; dist: string; state: string }>(
      `
      SELECT cluster_id, state, (centroid <=> $1::vector)::text AS dist
      FROM vc_world_cluster
      ORDER BY centroid <=> $1::vector
      LIMIT $2
      `,
      [vecLit, DEFAULT_NEIGHBOR_K]
    );

    let clusterId: number | null = null;
    for (const row of near.rows) {
      const d = Number(row.dist);
      if (!Number.isFinite(d) || d > maxDist) continue;
      if (row.state === "promoted") {
        await client.query(`UPDATE vc_world_candidate SET cluster_id = $2, updated_at = NOW() WHERE id = $1`, [
          String(args.candidateId),
          String(row.cluster_id),
        ]);
        await client.query("COMMIT");
        return;
      }
      clusterId = Number(row.cluster_id);
      break;
    }

    if (clusterId == null) {
      const ins = await client.query<{ cluster_id: string }>(
        `INSERT INTO vc_world_cluster (centroid, unique_user_count, state, updated_at)
         VALUES ($1::vector, 0, 'open', NOW()) RETURNING cluster_id::text AS cluster_id`,
        [vecLit]
      );
      clusterId = Number(ins.rows[0]?.cluster_id);
      if (!Number.isFinite(clusterId)) throw new Error("cluster_create_failed");
    }

    const distRow = await client.query<{ dist: string }>(
      `SELECT (centroid <=> $1::vector)::text AS dist FROM vc_world_cluster WHERE cluster_id = $2`,
      [vecLit, String(clusterId)]
    );
    const simDist = Number(distRow.rows[0]?.dist ?? "1");
    const sim = Number.isFinite(simDist) ? 1 - simDist : 0;

    await client.query(
      `
      INSERT INTO vc_cluster_observation (cluster_id, user_id, candidate_id, embedding, similarity_to_centroid)
      VALUES ($1, $2, $3, $4::vector, $5)
      ON CONFLICT (cluster_id, user_id) DO NOTHING
      `,
      [String(clusterId), candidate.proposer_user_id, String(args.candidateId), vecLit, sim]
    );

    await refreshClusterCentroid(client, clusterId);

    const cnt = await client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT user_id)::text AS c FROM vc_cluster_observation WHERE cluster_id = $1`,
      [String(clusterId)]
    );
    const uniqueUsers = Number(cnt.rows[0]?.c ?? "0");

    await client.query(
      `UPDATE vc_world_cluster SET unique_user_count = $2, updated_at = NOW() WHERE cluster_id = $1`,
      [String(clusterId), String(uniqueUsers)]
    );

    await client.query(`UPDATE vc_world_candidate SET cluster_id = $2, updated_at = NOW() WHERE id = $1`, [
      String(args.candidateId),
      String(clusterId),
    ]);

    if (uniqueUsers >= 3) {
      const lock = await client.query(
        `SELECT cluster_id FROM vc_world_cluster WHERE cluster_id = $1 AND state = 'open' FOR UPDATE`,
        [String(clusterId)]
      );
      if (lock.rows.length === 0) {
        await client.query("COMMIT");
        return;
      }

      const cnt2 = await client.query<{ c: string }>(
        `SELECT COUNT(DISTINCT user_id)::text AS c FROM vc_cluster_observation WHERE cluster_id = $1`,
        [String(clusterId)]
      );
      const u2 = Number(cnt2.rows[0]?.c ?? "0");
      if (u2 < 3) {
        await client.query("COMMIT");
        return;
      }

      const normHash = `canon:${sha256Hex(normalizeForHash(canon))}`;
      const factEmb = embedText(canon);
      const factLit = toPgVectorLiteral(factEmb);

      const insFact = await client.query<{ fact_id: string }>(
        `
        INSERT INTO vc_world_fact (canonical_text, normalized_hash, embedding, is_hot, last_hit_at)
        VALUES ($1, $2, $3::vector, TRUE, NOW())
        ON CONFLICT (normalized_hash) DO NOTHING
        RETURNING fact_id::text AS fact_id
        `,
        [canon.slice(0, 12000), normHash, factLit]
      );

      let factId: string | null = insFact.rows[0]?.fact_id ?? null;
      const inserted = Boolean(factId);

      if (!factId) {
        const ex = await client.query<{ fact_id: string }>(
          `SELECT fact_id::text AS fact_id FROM vc_world_fact WHERE normalized_hash = $1 LIMIT 1`,
          [normHash]
        );
        factId = ex.rows[0]?.fact_id ?? null;
      }

      if (!factId) {
        await client.query("ROLLBACK");
        throw new Error("fact_upsert_failed");
      }

      if (inserted) {
        await client.query(`UPDATE vc_world_meta SET world_revision = world_revision + 1 WHERE id = 1`);
      }

      await client.query(
        `UPDATE vc_world_cluster SET state = 'promoted', promoted_fact_id = $2::bigint, updated_at = NOW()
         WHERE cluster_id = $1 AND state = 'open'`,
        [String(clusterId), factId]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * 扫描应进入共识的候选并入队 CONSENSUS_ONE（供 CONSENSUS_SWEEP job 调用）。
 */
export async function enqueueConsensusSweepBatch(limit = 40): Promise<number> {
  let client;
  try {
    client = await pool.connect();
  } catch {
    return 0;
  }
  let n = 0;
  try {
    const r = await client.query<{ id: string }>(
      `
      SELECT id::text AS id FROM vc_world_candidate
      WHERE janitor_status = 'done'
        AND janitor_action = 'enter_consensus'
        AND compliance_ok = TRUE
        AND cluster_id IS NULL
        AND proposer_user_id IS NOT NULL
      ORDER BY id
      LIMIT $1
      `,
      [String(Math.min(200, Math.max(1, limit)))]
    );
    for (const row of r.rows) {
      await client.query(
        `INSERT INTO vc_jobs (job_type, payload, run_at, priority, status)
         VALUES ('CONSENSUS_ONE', $1::jsonb, NOW(), 3, 'pending')`,
        [JSON.stringify({ candidateId: Number(row.id) })]
      );
      n += 1;
    }
    return n;
  } catch {
    return 0;
  } finally {
    client.release();
  }
}
