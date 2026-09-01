// src/db/ensureSchema.ivfflat.test.ts
// Unit test for the ivfflat dimension guard added after the live ISSUE-002 incident.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorldKnowledgeChunksIvfflatIndexSql,
  PG_VECTOR_IVFFLAT_MAX_DIMENSIONS,
} from "./ensureSchema.ivfflat";

void PG_VECTOR_IVFFLAT_MAX_DIMENSIONS; // explicit reference to keep type export alive

test("buildWorldKnowledgeChunksIvfflatIndexSql: returns SQL when dimension is within pgvector limit", () => {
  const sql = buildWorldKnowledgeChunksIvfflatIndexSql(1024);
  assert.ok(sql, "expected non-null SQL for 1024 dimensions");
  assert.match(sql!, /CREATE INDEX IF NOT EXISTS world_knowledge_chunks_embedding_ivfflat/);
  assert.match(sql!, /USING ivfflat \(embedding_vector vector_cosine_ops\)/);
});

test("buildWorldKnowledgeChunksIvfflatIndexSql: returns SQL at the pgvector boundary (2000)", () => {
  const sql = buildWorldKnowledgeChunksIvfflatIndexSql(2000);
  assert.ok(sql, "expected non-null SQL at 2000 dimensions (boundary inclusive)");
});

test("buildWorldKnowledgeChunksIvfflatIndexSql: returns null when dimension exceeds pgvector limit (2048)", () => {
  // Reproduces ISSUE-002: .env.local has AI_EMBEDDING_DIMENSION=2048, which used to
  // crash every heartbeat with "column cannot have more than 2000 dimensions for ivfflat index".
  const sql = buildWorldKnowledgeChunksIvfflatIndexSql(2048);
  assert.equal(sql, null);
});

test("buildWorldKnowledgeChunksIvfflatIndexSql: returns null for 3072 (openai text-embedding-3-large)", () => {
  const sql = buildWorldKnowledgeChunksIvfflatIndexSql(3072);
  assert.equal(sql, null);
});

test("buildWorldKnowledgeChunksIvfflatIndexSql: rejects invalid dimensions", () => {
  assert.throws(() => buildWorldKnowledgeChunksIvfflatIndexSql(0));
  assert.throws(() => buildWorldKnowledgeChunksIvfflatIndexSql(-1));
  assert.throws(() => buildWorldKnowledgeChunksIvfflatIndexSql(Number.NaN));
  assert.throws(() => buildWorldKnowledgeChunksIvfflatIndexSql(Number.POSITIVE_INFINITY));
});
