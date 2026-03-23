import { normalizeForHash } from "@/lib/kg/normalize";
import { classifyFactScope } from "./classifyFactScope";
import { detectConflicts, type ConflictDecision, type ConflictProbe } from "./detectConflicts";
import { extractFactsFromTurn, type ExtractFactsInput } from "./extractFactsFromTurn";
import { mergeKnowledgeChunk } from "./mergeKnowledgeChunk";

export interface PersistTurnFactsInput extends ExtractFactsInput {
  requestId: string;
}

export interface PersistTurnFactsResult {
  extractedCount: number;
  privateOrSessionWritten: number;
  sharedCandidateQueued: number;
  rejectedCount: number;
}

export interface PersistTurnFactsDeps {
  createConflictProbe?: () => Promise<ConflictProbe>;
  enqueueSharedCandidate?: (args: { userId: string | null; text: string }) => Promise<void>;
  persistPrivateFacts?: (decisions: ConflictDecision[]) => Promise<number>;
}

async function defaultEnqueueSharedCandidate(args: { userId: string | null; text: string }): Promise<void> {
  if (!args.text.trim()) return;
  const { ingestUserKnowledge } = await import("@/lib/kg/ingest");
  await ingestUserKnowledge({
    userId: args.userId,
    latestUserInput: args.text.slice(0, 4000),
    route: { kind: "PUBLIC_CANDIDATE", confidence: 0.9, reasons: ["world_writeback"] },
  });
}

async function createDbConflictProbe(): Promise<ConflictProbe> {
  const { pool } = await import("@/db");
  return {
    async hasCoreConflict(normalized: string): Promise<boolean> {
      const c = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS(
          SELECT 1 FROM world_knowledge_chunks c
          JOIN world_entities e ON e.id = c.entity_id
          WHERE c.visibility_scope='global'
            AND e.scope='global'
            AND e.source_type='bootstrap'
            AND c.content ILIKE $1
          LIMIT 1
        ) AS exists`,
        [`%${normalized.slice(0, 80)}%`]
      );
      return Boolean(c.rows[0]?.exists);
    },
    async hasSharedConflict(normalized: string): Promise<boolean> {
      const c = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS(
          SELECT 1 FROM world_player_facts
          WHERE approved_to_shared=true AND normalized_fact = $1
          LIMIT 1
        ) AS exists`,
        [normalized]
      );
      return Boolean(c.rows[0]?.exists);
    },
    async hasPrivateConflict(args: { userId: string | null; normalized: string }): Promise<boolean> {
      if (!args.userId) return false;
      const c = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS(
          SELECT 1 FROM world_player_facts
          WHERE user_id = $1 AND normalized_fact = $2
          LIMIT 1
        ) AS exists`,
        [args.userId, args.normalized]
      );
      return Boolean(c.rows[0]?.exists);
    },
  };
}

async function writePrivateFacts(decisions: ConflictDecision[]): Promise<number> {
  const writable = decisions.filter((x) => x.action === "allow_private");
  if (!writable.length) return 0;
  const { pool } = await import("@/db");
  const drafts = mergeKnowledgeChunk(writable);
  if (!drafts.length) return 0;
  const client = await pool.connect();
  let writes = 0;
  try {
    await client.query("BEGIN");
    for (const d of drafts) {
      const entityInsert = await client.query<{ id: number }>(
        `INSERT INTO world_entities
          (entity_type, code, canonical_name, title, summary, detail, scope, owner_user_id, status, source_type, source_ref, importance, version)
         VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1)
         ON CONFLICT (entity_type, code) DO UPDATE SET
           canonical_name=EXCLUDED.canonical_name,
           summary=EXCLUDED.summary,
           detail=EXCLUDED.detail,
           scope=EXCLUDED.scope,
           owner_user_id=EXCLUDED.owner_user_id,
           status=EXCLUDED.status,
           source_type=EXCLUDED.source_type,
           source_ref=EXCLUDED.source_ref,
           importance=GREATEST(world_entities.importance, EXCLUDED.importance),
           version=world_entities.version+1,
           updated_at=NOW()
         RETURNING id`,
        [
          d.entityType,
          d.code,
          d.canonicalName,
          d.canonicalName,
          d.summary,
          d.detail,
          d.scope,
          d.ownerUserId,
          d.status,
          d.sourceType,
          d.retrievalKey,
          70,
        ]
      );
      const entityId = entityInsert.rows[0]?.id;
      if (!entityId) continue;

      await client.query(
        `INSERT INTO world_knowledge_chunks
          (entity_id, chunk_index, content, content_tsv, token_estimate, importance, visibility_scope, owner_user_id, retrieval_key, embedding_model, embedding_status, embedding_vector)
         VALUES
          ($1,0,$2,to_tsvector('simple',$2),$3,$4,$5,$6,$7,'local_ngram_v1','pending',NULL)
         ON CONFLICT (entity_id, chunk_index) DO UPDATE SET
           content=EXCLUDED.content,
           content_tsv=to_tsvector('simple',EXCLUDED.content),
           token_estimate=EXCLUDED.token_estimate,
           importance=GREATEST(world_knowledge_chunks.importance, EXCLUDED.importance),
           visibility_scope=EXCLUDED.visibility_scope,
           owner_user_id=EXCLUDED.owner_user_id,
           retrieval_key=EXCLUDED.retrieval_key,
           embedding_status='pending',
           updated_at=NOW()`,
        [entityId, d.chunkContent, Math.max(8, Math.ceil(d.chunkContent.length / 4)), 75, d.scope, d.ownerUserId, d.retrievalKey]
      );

      for (const tag of d.tags) {
        await client.query(`INSERT INTO world_entity_tags (entity_id, tag) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
          entityId,
          tag.slice(0, 120),
        ]);
      }

      await client.query(
        `WITH latest AS (
          SELECT id FROM world_player_facts
          WHERE user_id = $1 AND session_id = $2 AND fact_type = $3 AND normalized_fact = $4
          ORDER BY updated_at DESC LIMIT 1
        )
        UPDATE world_player_facts
        SET raw_fact=$5, confidence=$6, conflict_status=$7, entity_id=$8, updated_at=NOW()
        WHERE id IN (SELECT id FROM latest)`,
        [
          d.ownerUserId,
          d.scope === "session" ? d.retrievalKey.split(":")[1] ?? "unknown" : "global",
          d.scope,
          normalizeForHash(d.chunkContent),
          d.chunkContent,
          80,
          d.conflictStatus,
          entityId,
        ]
      );
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO world_player_facts
          (user_id, session_id, fact_type, entity_id, normalized_fact, raw_fact, confidence, conflict_status, approved_to_shared)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,false
         WHERE NOT EXISTS (
           SELECT 1 FROM world_player_facts
           WHERE user_id=$1 AND session_id=$2 AND fact_type=$3 AND normalized_fact=$5
         )
         RETURNING id`,
        [
          d.ownerUserId,
          d.scope === "session" ? d.retrievalKey.split(":")[1] ?? "unknown" : "global",
          d.scope,
          entityId,
          normalizeForHash(d.chunkContent),
          d.chunkContent,
          80,
          d.conflictStatus,
        ]
      );
      if (inserted.rows[0]?.id) writes += 1;
    }
    await client.query("COMMIT");
    return writes;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function persistTurnFacts(
  input: PersistTurnFactsInput,
  deps: PersistTurnFactsDeps = {}
): Promise<PersistTurnFactsResult> {
  const extracted = extractFactsFromTurn(input);
  const scoped = classifyFactScope(extracted);
  const probe = deps.createConflictProbe ? await deps.createConflictProbe() : await createDbConflictProbe();
  const decisions = await detectConflicts({ facts: scoped, probe });

  let queued = 0;
  const enqueue = deps.enqueueSharedCandidate ?? defaultEnqueueSharedCandidate;
  for (const d of decisions) {
    if (d.action !== "enqueue_review") continue;
    if (d.fact.confidence < 0.78) continue;
    await enqueue({ userId: d.fact.userId, text: d.fact.text });
    queued += 1;
  }

  const writer = deps.persistPrivateFacts ?? writePrivateFacts;
  const written = await writer(decisions);
  const rejected = decisions.filter((x) => x.action === "reject_shared_direct").length;
  return {
    extractedCount: extracted.length,
    privateOrSessionWritten: written,
    sharedCandidateQueued: queued,
    rejectedCount: rejected,
  };
}
