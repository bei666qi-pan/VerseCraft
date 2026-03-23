import type { RetrievalCandidate, RetrievalPlan, RetrievalResult, RuntimeLoreRequest } from "../types";
import { WORLD_KNOWLEDGE_MAX_DB_ROUND_TRIPS, WORLD_KNOWLEDGE_MAX_RETRIEVED_FACTS } from "../constants";

type ChunkRow = {
  chunk_id: number;
  entity_id: number;
  code: string;
  canonical_name: string;
  entity_type: string;
  entity_scope: string;
  owner_user_id: string | null;
  status: string;
  source_type: string;
  entity_importance: number;
  chunk_index: number;
  content: string;
  chunk_importance: number;
  visibility_scope: string;
  retrieval_key: string | null;
};

function mapRowToCandidate(row: ChunkRow, from: "exact" | "tag" | "fts" | "vector", score: number): RetrievalCandidate {
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
      isHot: row.chunk_importance >= 80 || row.entity_importance >= 85,
    },
    score,
    debug: { from },
  };
}

function dedupeCandidates(candidates: RetrievalCandidate[]): RetrievalCandidate[] {
  const m = new Map<string, RetrievalCandidate>();
  for (const c of candidates) {
    const key = c.fact.identity.factKey;
    const prev = m.get(key);
    if (!prev || c.score > prev.score) m.set(key, c);
  }
  return [...m.values()].slice(0, WORLD_KNOWLEDGE_MAX_RETRIEVED_FACTS);
}

export function mergeScopeFilterSql(input: RuntimeLoreRequest): { sql: string; params: unknown[] } {
  const scopeSet = new Set(input.worldScope);
  const allowGlobal = scopeSet.has("core") || scopeSet.has("shared");
  const allowUser = scopeSet.has("user") && Boolean(input.userId);
  const allowSession = scopeSet.has("session") && Boolean(input.sessionId);

  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (allowGlobal) clauses.push(`(c.visibility_scope = 'global')`);
  if (allowUser) {
    clauses.push(`(c.visibility_scope = 'user' AND c.owner_user_id = $${i})`);
    params.push(input.userId);
    i += 1;
  }
  if (allowSession) {
    // session facts must be isolated by both owner and session key prefix.
    clauses.push(
      `(c.visibility_scope = 'session' AND c.owner_user_id = $${i} AND c.retrieval_key LIKE $${i + 1})`
    );
    params.push(input.userId);
    params.push(`session:${input.sessionId}:%`);
    i += 2;
  }
  if (clauses.length === 0) clauses.push(`(c.visibility_scope = 'global')`);
  return { sql: clauses.join(" OR "), params };
}

export async function retrieveWorldKnowledge(args: {
  input: RuntimeLoreRequest;
  plan: RetrievalPlan;
}): Promise<RetrievalResult> {
  const { pool } = await import("@/db");
  const dbRoundTripLimit = WORLD_KNOWLEDGE_MAX_DB_ROUND_TRIPS;
  let dbRoundTrips = 0;
  const used = { keyCount: 0, ftsCount: 0, vectorCount: 0, tagCount: 0 };
  const allCandidates: RetrievalCandidate[] = [];

  const client = await pool.connect();
  try {
    const scopeFilter = mergeScopeFilterSql(args.input);

    // 1) exact
    if (args.plan.exactCodes.length > 0 || args.plan.exactCanonicalNames.length > 0 || args.plan.locationHints.length > 0) {
      if (dbRoundTrips < dbRoundTripLimit) {
        dbRoundTrips += 1;
        const exactVals = [...args.plan.exactCodes, ...args.plan.locationHints];
        const canonicalVals = args.plan.exactCanonicalNames;
        const ret = await client.query<ChunkRow>(
          `
            SELECT
              c.id AS chunk_id, c.entity_id, e.code, e.canonical_name, e.entity_type, e.scope AS entity_scope,
              e.owner_user_id, e.status, e.source_type, e.importance AS entity_importance,
              c.chunk_index, c.content, c.importance AS chunk_importance, c.visibility_scope, c.retrieval_key
            FROM world_knowledge_chunks c
            JOIN world_entities e ON e.id = c.entity_id
            WHERE (${scopeFilter.sql})
              AND (
                (array_length($${scopeFilter.params.length + 1}::text[], 1) IS NOT NULL AND e.code = ANY($${scopeFilter.params.length + 1}::text[]))
                OR (array_length($${scopeFilter.params.length + 2}::text[], 1) IS NOT NULL AND e.canonical_name = ANY($${scopeFilter.params.length + 2}::text[]))
                OR (array_length($${scopeFilter.params.length + 3}::text[], 1) IS NOT NULL AND c.retrieval_key = ANY($${scopeFilter.params.length + 3}::text[]))
              )
            ORDER BY c.importance DESC, e.importance DESC
            LIMIT $${scopeFilter.params.length + 4}
          `,
          [...scopeFilter.params, exactVals, canonicalVals, args.plan.locationHints, args.plan.retrievalBudget.keyTopN]
        );
        used.keyCount = ret.rows.length;
        allCandidates.push(...ret.rows.map((r, idx) => mapRowToCandidate(r, "exact", 100 - idx)));
      }
    }

    // 2) tag filter
    if (args.plan.tagHints.length > 0 && dbRoundTrips < dbRoundTripLimit) {
      dbRoundTrips += 1;
      const ret = await client.query<ChunkRow>(
        `
          SELECT
            c.id AS chunk_id, c.entity_id, e.code, e.canonical_name, e.entity_type, e.scope AS entity_scope,
            e.owner_user_id, e.status, e.source_type, e.importance AS entity_importance,
            c.chunk_index, c.content, c.importance AS chunk_importance, c.visibility_scope, c.retrieval_key
          FROM world_knowledge_chunks c
          JOIN world_entities e ON e.id = c.entity_id
          JOIN world_entity_tags t ON t.entity_id = e.id
          WHERE (${scopeFilter.sql})
            AND t.tag = ANY($${scopeFilter.params.length + 1}::text[])
          ORDER BY c.importance DESC, e.importance DESC
          LIMIT $${scopeFilter.params.length + 2}
        `,
        [...scopeFilter.params, args.plan.tagHints, args.plan.retrievalBudget.ftsTopN]
      );
      used.tagCount = ret.rows.length;
      allCandidates.push(...ret.rows.map((r, idx) => mapRowToCandidate(r, "tag", 80 - idx)));
    }

    // 3) FTS
    if (args.plan.ftsQuery && dbRoundTrips < dbRoundTripLimit) {
      dbRoundTrips += 1;
      const ret = await client.query<ChunkRow & { rank: number }>(
        `
          SELECT
            c.id AS chunk_id, c.entity_id, e.code, e.canonical_name, e.entity_type, e.scope AS entity_scope,
            e.owner_user_id, e.status, e.source_type, e.importance AS entity_importance,
            c.chunk_index, c.content, c.importance AS chunk_importance, c.visibility_scope, c.retrieval_key,
            ts_rank(c.content_tsv, plainto_tsquery('simple', $${scopeFilter.params.length + 1})) AS rank
          FROM world_knowledge_chunks c
          JOIN world_entities e ON e.id = c.entity_id
          WHERE (${scopeFilter.sql})
            AND c.content_tsv @@ plainto_tsquery('simple', $${scopeFilter.params.length + 1})
          ORDER BY rank DESC, c.importance DESC
          LIMIT $${scopeFilter.params.length + 2}
        `,
        [...scopeFilter.params, args.plan.ftsQuery, args.plan.retrievalBudget.ftsTopN]
      );
      used.ftsCount = ret.rows.length;
      allCandidates.push(...ret.rows.map((r, idx) => mapRowToCandidate(r, "fts", Math.max(20, 70 - idx))));
    }

    // 4) vector adapter (phase-3: interface reserved, runtime no-op by default)
    used.vectorCount = 0;

    const deduped = dedupeCandidates(allCandidates);
    return {
      facts: deduped.map((x) => x.fact),
      used,
      debugCandidates: deduped,
      dbRoundTrips,
    };
  } finally {
    client.release();
  }
}
