import { pool } from "@/db";
import { embedText, toPgVectorLiteral } from "@/lib/kg/embed";
import { buildRegistryWorldKnowledgeDraft } from "./registryAdapters";

export interface SeedFromRegistryOptions {
  dryRun?: boolean;
}

export interface SeedFromRegistryResult {
  dryRun: boolean;
  entitiesUpserted: number;
  tagsUpserted: number;
  edgesUpserted: number;
  chunksUpserted: number;
}

type PgClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

async function hasVectorType(client: PgClient): Promise<boolean> {
  try {
    const ret = await client.query(`SELECT (to_regtype('vector') IS NOT NULL) AS ok;`);
    return Boolean(ret.rows[0]?.ok);
  } catch {
    return false;
  }
}

export async function seedFromRegistry(options: SeedFromRegistryOptions = {}): Promise<SeedFromRegistryResult> {
  const draft = buildRegistryWorldKnowledgeDraft();
  const dryRun = options.dryRun === true;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const vectorEnabled = await hasVectorType(client);
    const entityIdByCode = new Map<string, number>();
    let entitiesUpserted = 0;
    let tagsUpserted = 0;
    let edgesUpserted = 0;
    let chunksUpserted = 0;

    for (const entity of draft.entities) {
      const row = await client.query(
        `
          INSERT INTO world_entities (
            entity_type, code, canonical_name, title, summary, detail,
            scope, owner_user_id, status, source_type, source_ref, importance, version
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (entity_type, code) DO UPDATE SET
            canonical_name = EXCLUDED.canonical_name,
            title = EXCLUDED.title,
            summary = EXCLUDED.summary,
            detail = EXCLUDED.detail,
            scope = EXCLUDED.scope,
            owner_user_id = EXCLUDED.owner_user_id,
            status = EXCLUDED.status,
            source_type = EXCLUDED.source_type,
            source_ref = EXCLUDED.source_ref,
            importance = EXCLUDED.importance,
            version = EXCLUDED.version,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `,
        [
          entity.entityType,
          entity.code,
          entity.canonicalName,
          entity.title,
          entity.summary,
          entity.detail,
          entity.scope,
          entity.ownerUserId,
          entity.status,
          entity.sourceType,
          entity.sourceRef,
          entity.importance,
          entity.version,
        ]
      );
      const id = Number(row.rows[0]?.id);
      if (!Number.isFinite(id)) throw new Error(`failed_to_upsert_entity:${entity.code}`);
      entityIdByCode.set(entity.code, id);
      entitiesUpserted += 1;

      for (const tag of entity.tags) {
        const tagRet = await client.query(
          `
            INSERT INTO world_entity_tags (entity_id, tag)
            VALUES ($1, $2)
            ON CONFLICT (entity_id, tag) DO NOTHING
          `,
          [id, tag]
        );
        tagsUpserted += tagRet.rowCount ?? 0;
      }
    }

    for (const edge of draft.edges) {
      const fromId = entityIdByCode.get(edge.fromEntityCode);
      const toId = entityIdByCode.get(edge.toEntityCode);
      if (!fromId || !toId) continue;
      const edgeRet = await client.query(
        `
          INSERT INTO world_entity_edges (from_entity_id, to_entity_id, relation_type, relation_label, strength)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (from_entity_id, to_entity_id, relation_type, relation_label) DO UPDATE SET
            strength = EXCLUDED.strength
        `,
        [fromId, toId, edge.relationType, edge.relationLabel, edge.strength]
      );
      edgesUpserted += edgeRet.rowCount ?? 0;
    }

    for (const chunk of draft.chunks) {
      const entityId = entityIdByCode.get(chunk.entityCode);
      if (!entityId) continue;
      const emb = embedText(chunk.content);
      const embLiteral = toPgVectorLiteral(emb);

      if (vectorEnabled) {
        const ret = await client.query(
          `
            INSERT INTO world_knowledge_chunks (
              entity_id, chunk_index, content, content_tsv, token_estimate, importance,
              visibility_scope, owner_user_id, retrieval_key,
              embedding_model, embedding_status, embedding_vector
            )
            VALUES (
              $1, $2, $3, to_tsvector('simple', $3), $4, $5,
              $6, $7, $8, $9, 'ready', $10::vector
            )
            ON CONFLICT (entity_id, chunk_index) DO UPDATE SET
              content = EXCLUDED.content,
              content_tsv = to_tsvector('simple', EXCLUDED.content),
              token_estimate = EXCLUDED.token_estimate,
              importance = EXCLUDED.importance,
              visibility_scope = EXCLUDED.visibility_scope,
              owner_user_id = EXCLUDED.owner_user_id,
              retrieval_key = EXCLUDED.retrieval_key,
              embedding_model = EXCLUDED.embedding_model,
              embedding_status = EXCLUDED.embedding_status,
              embedding_vector = EXCLUDED.embedding_vector,
              updated_at = CURRENT_TIMESTAMP
          `,
          [
            entityId,
            chunk.chunkIndex,
            chunk.content,
            chunk.tokenEstimate,
            chunk.importance,
            chunk.visibilityScope,
            chunk.ownerUserId,
            chunk.retrievalKey,
            "vc-local-ngram-256",
            embLiteral,
          ]
        );
        chunksUpserted += ret.rowCount ?? 0;
      } else {
        const ret = await client.query(
          `
            INSERT INTO world_knowledge_chunks (
              entity_id, chunk_index, content, content_tsv, token_estimate, importance,
              visibility_scope, owner_user_id, retrieval_key,
              embedding_model, embedding_status, embedding_vector
            )
            VALUES (
              $1, $2, $3, to_tsvector('simple', $3), $4, $5,
              $6, $7, $8, $9, 'ready', $10
            )
            ON CONFLICT (entity_id, chunk_index) DO UPDATE SET
              content = EXCLUDED.content,
              content_tsv = to_tsvector('simple', EXCLUDED.content),
              token_estimate = EXCLUDED.token_estimate,
              importance = EXCLUDED.importance,
              visibility_scope = EXCLUDED.visibility_scope,
              owner_user_id = EXCLUDED.owner_user_id,
              retrieval_key = EXCLUDED.retrieval_key,
              embedding_model = EXCLUDED.embedding_model,
              embedding_status = EXCLUDED.embedding_status,
              embedding_vector = EXCLUDED.embedding_vector,
              updated_at = CURRENT_TIMESTAMP
          `,
          [
            entityId,
            chunk.chunkIndex,
            chunk.content,
            chunk.tokenEstimate,
            chunk.importance,
            chunk.visibilityScope,
            chunk.ownerUserId,
            chunk.retrievalKey,
            "vc-local-ngram-256",
            embLiteral,
          ]
        );
        chunksUpserted += ret.rowCount ?? 0;
      }
    }

    if (dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    return {
      dryRun,
      entitiesUpserted,
      tagsUpserted,
      edgesUpserted,
      chunksUpserted,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
