import "server-only";

import { pool } from "@/db";

type QueryRow = Record<string, unknown>;

function toRows<T extends QueryRow>(rows: QueryRow[]): T[] {
  return rows as T[];
}

export async function listWorldKnowledgeEntities(input: {
  scope?: string;
  entityType?: string;
  status?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.max(1, Math.min(200, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);
  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.scope) {
    where.push(`e.scope = $${i++}`);
    params.push(input.scope);
  }
  if (input.entityType) {
    where.push(`e.entity_type = $${i++}`);
    params.push(input.entityType);
  }
  if (input.status) {
    where.push(`e.status = $${i++}`);
    params.push(input.status);
  }
  if (input.userId) {
    where.push(`e.owner_user_id = $${i++}`);
    params.push(input.userId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const q = `
    SELECT
      e.id, e.entity_type, e.code, e.canonical_name, e.scope, e.owner_user_id, e.status, e.source_type,
      e.importance, e.version, e.updated_at,
      COALESCE(c.chunk_count, 0)::int AS chunk_count,
      COALESCE(t.tag_count, 0)::int AS tag_count
    FROM world_entities e
    LEFT JOIN (
      SELECT entity_id, COUNT(*) AS chunk_count
      FROM world_knowledge_chunks
      GROUP BY entity_id
    ) c ON c.entity_id = e.id
    LEFT JOIN (
      SELECT entity_id, COUNT(*) AS tag_count
      FROM world_entity_tags
      GROUP BY entity_id
    ) t ON t.entity_id = e.id
    ${whereSql}
    ORDER BY e.updated_at DESC
    LIMIT $${i++} OFFSET $${i++}
  `;
  params.push(limit, offset);
  const res = await pool.query(q, params);
  return toRows<{
    id: number;
    entity_type: string;
    code: string;
    canonical_name: string;
    scope: string;
    owner_user_id: string | null;
    status: string;
    source_type: string;
    importance: number;
    version: number;
    updated_at: string;
    chunk_count: number;
    tag_count: number;
  }>(res.rows);
}

export async function getWorldKnowledgeEntityDetail(entityId: number) {
  const entityQ = await pool.query(
    `SELECT id, entity_type, code, canonical_name, title, summary, detail, scope, owner_user_id, status, source_type, source_ref, importance, version, created_at, updated_at
     FROM world_entities WHERE id = $1 LIMIT 1`,
    [entityId]
  );
  const entity = entityQ.rows[0] ?? null;
  if (!entity) return null;
  const [chunksQ, tagsQ, edgesQ, factsQ] = await Promise.all([
    pool.query(
      `SELECT id, chunk_index, content, token_estimate, importance, visibility_scope, owner_user_id, retrieval_key, embedding_status, updated_at
       FROM world_knowledge_chunks WHERE entity_id = $1 ORDER BY chunk_index ASC`,
      [entityId]
    ),
    pool.query(`SELECT tag FROM world_entity_tags WHERE entity_id = $1 ORDER BY tag ASC`, [entityId]),
    pool.query(
      `SELECT id, from_entity_id, to_entity_id, relation_type, relation_label, strength, created_at
       FROM world_entity_edges WHERE from_entity_id = $1 OR to_entity_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [entityId]
    ),
    pool.query(
      `SELECT id, user_id, session_id, fact_type, normalized_fact, confidence, conflict_status, approved_to_shared, updated_at
       FROM world_player_facts WHERE entity_id = $1 ORDER BY updated_at DESC LIMIT 100`,
      [entityId]
    ),
  ]);

  return {
    entity,
    chunks: chunksQ.rows,
    tags: tagsQ.rows.map((r) => String(r.tag)),
    edges: edgesQ.rows,
    facts: factsQ.rows,
  };
}

export async function listWorldKnowledgeCandidates(input: { status?: string; limit?: number; offset?: number }) {
  const limit = Math.max(1, Math.min(200, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);
  const status = input.status?.trim();
  const where = status ? `WHERE COALESCE(wpf.conflict_status, 'none') = $1` : "";
  const params: unknown[] = status ? [status, limit, offset] : [limit, offset];
  const statusIndex = status ? 2 : 1;
  const offsetIndex = status ? 3 : 2;
  const privateQ = await pool.query(
    `SELECT
      wpf.id::text AS candidate_id,
      'world_player_facts'::text AS source,
      wpf.user_id,
      wpf.session_id,
      wpf.fact_type,
      wpf.raw_fact AS body,
      COALESCE(wpf.conflict_status, 'none') AS status,
      wpf.approved_to_shared,
      wpf.updated_at
     FROM world_player_facts wpf
     ${where}
     ORDER BY wpf.updated_at DESC
     LIMIT $${statusIndex} OFFSET $${offsetIndex}`,
    params
  );

  let sharedRows: QueryRow[] = [];
  try {
    const sharedQ = await pool.query(
      `SELECT
        id::text AS candidate_id,
        'vc_world_candidate'::text AS source,
        proposer_user_id AS user_id,
        NULL::text AS session_id,
        'shared_candidate'::text AS fact_type,
        body,
        COALESCE(janitor_status, status, 'unknown') AS status,
        false AS approved_to_shared,
        updated_at
       FROM vc_world_candidate
       ORDER BY updated_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    sharedRows = sharedQ.rows;
  } catch {
    sharedRows = [];
  }

  return [...privateQ.rows, ...sharedRows]
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, limit);
}

export async function reviewWorldKnowledgeCandidate(input: {
  candidateId: string;
  source: "world_player_facts" | "vc_world_candidate";
  decision: "allow_shared" | "reject" | "private_only";
}) {
  if (input.source === "world_player_facts") {
    const approved = input.decision === "allow_shared";
    const status =
      input.decision === "reject" ? "rejected" : input.decision === "private_only" ? "private_only" : "verified_candidate";
    const res = await pool.query(
      `UPDATE world_player_facts
       SET approved_to_shared = $2, conflict_status = $3, updated_at = NOW()
       WHERE id = $1::int
       RETURNING id, approved_to_shared, conflict_status, updated_at`,
      [input.candidateId, approved, status]
    );
    return res.rows[0] ?? null;
  }

  const nextStatus = input.decision === "reject" ? "discard" : "enter_consensus";
  const res = await pool.query(
    `UPDATE vc_world_candidate
     SET janitor_action = $2, updated_at = NOW()
     WHERE id = $1::int
     RETURNING id, janitor_action, updated_at`,
    [input.candidateId, nextStatus]
  );
  return res.rows[0] ?? null;
}

export async function getWorldKnowledgeRetrievalStats() {
  const retrievalWindow = await pool.query(
    `SELECT
      COUNT(*)::int AS total_events,
      COUNT(*) FILTER (WHERE payload->>'loreCacheHit' = 'true')::int AS cache_hit_events,
      COUNT(*) FILTER (WHERE payload->>'loreFallbackPath' = 'registry')::int AS registry_fallback_events,
      COALESCE(AVG(NULLIF(payload->>'loreRetrievalLatencyMs','')::numeric), 0)::float AS avg_latency_ms,
      COALESCE(AVG(NULLIF(payload->>'loreSourceCount','')::numeric), 0)::float AS avg_source_count
     FROM analytics_events
     WHERE event_name = 'chat_request_started'
       AND event_time >= NOW() - INTERVAL '24 hours'`
  );
  const writebackWindow = await pool.query(
    `SELECT
      COUNT(*)::int AS private_fact_count,
      COUNT(*) FILTER (WHERE fact_type = 'session')::int AS session_fact_count,
      COUNT(*) FILTER (WHERE approved_to_shared = true)::int AS approved_shared_count,
      COUNT(*) FILTER (WHERE conflict_status IS NOT NULL AND conflict_status <> 'none')::int AS conflict_count
     FROM world_player_facts
     WHERE updated_at >= NOW() - INTERVAL '24 hours'`
  );
  return {
    retrieval24h: retrievalWindow.rows[0] ?? {},
    writeback24h: writebackWindow.rows[0] ?? {},
  };
}
