import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveWorldDirectorConfig } from "./config";

test("resolveWorldDirectorConfig: defaults to enabled=true, mode=soft, hintInjectionEnabled=true", () => {
  const config = resolveWorldDirectorConfig();
  assert.equal(config.enabled, true, "enabled should be true by default");
  assert.equal(config.mode, "soft", "mode should be 'soft' by default");
  assert.equal(config.hintInjectionEnabled, true, "hintInjectionEnabled should be true in soft mode");
});

test("resolveWorldDirectorConfig: maxDueHints defaults to 2", () => {
  const config = resolveWorldDirectorConfig();
  assert.equal(config.maxDueHints, 2);
});

test("resolveWorldDirectorConfig: criticEnabled defaults to false", () => {
  const config = resolveWorldDirectorConfig();
  assert.equal(config.criticEnabled, false);
});

test("production Docker image starts embedded worker by default", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  assert.match(dockerfile, /scripts\/start-production\.mjs/);
  assert.match(dockerfile, /\/app\/src \.\/src/);
  assert.match(dockerfile, /\/app\/node_modules \.\/node_modules/);
});

test("KG job queue schema is created even when pgvector is unavailable", () => {
  const migrate = readFileSync("scripts/migrate.js", "utf8");
  const ensureSchema = readFileSync("src/db/ensureSchema.ts", "utf8");

  assert.match(migrate, /async function ensureKgCoreLayer/);
  assert.match(ensureSchema, /async function ensureKgCoreTables/);

  const migrateSemanticLayer = migrate.slice(
    migrate.indexOf("async function ensureKgSemanticLayer"),
    migrate.indexOf("CREATE TABLE IF NOT EXISTS vc_semantic_cache")
  );
  assert.ok(
    migrateSemanticLayer.indexOf("await ensureKgCoreLayer(client)") <
      migrateSemanticLayer.indexOf("CREATE EXTENSION IF NOT EXISTS vector"),
    "migrate.js must create vc_world_meta before optional vector setup"
  );

  const migrateWorkerLayer = migrate.slice(
    migrate.indexOf("async function ensureKgWorkerLayer"),
    migrate.indexOf("const candCols = [")
  );
  assert.ok(
    migrateWorkerLayer.indexOf("CREATE TABLE IF NOT EXISTS vc_jobs") <
      migrateWorkerLayer.indexOf("CREATE EXTENSION IF NOT EXISTS vector"),
    "migrate.js must create vc_jobs before optional vector setup"
  );

  const runtimeKgSchemaStart = ensureSchema.indexOf("async function ensureKgSchema");
  const runtimeKgSchema = ensureSchema.slice(
    runtimeKgSchemaStart,
    ensureSchema.indexOf("CREATE TABLE IF NOT EXISTS vc_world_meta", runtimeKgSchemaStart)
  );
  assert.ok(
    runtimeKgSchema.indexOf("await ensureKgCoreTables(client)") <
      runtimeKgSchema.indexOf("CREATE EXTENSION IF NOT EXISTS vector"),
    "ensureRuntimeSchema must create vc_world_meta before optional vector setup"
  );
  assert.ok(
    runtimeKgSchema.indexOf("CREATE TABLE IF NOT EXISTS vc_jobs") <
      runtimeKgSchema.indexOf("CREATE EXTENSION IF NOT EXISTS vector"),
    "ensureRuntimeSchema must create vc_jobs before optional vector setup"
  );
});

test("world director reasoner request disables thinking to produce consumable JSON content", () => {
  const engine = readFileSync("src/lib/worldEngine/engine.ts", "utf8");
  const callStart = engine.indexOf("runOfflineReasonerTask({");
  const callEnd = engine.indexOf("devOverrides:", callStart);
  const reasonerCall = engine.slice(callStart, callEnd);

  assert.match(reasonerCall, /extraBody:\s*{/);
  assert.match(reasonerCall, /enable_thinking:\s*false/);
  assert.match(reasonerCall, /thinking:\s*{\s*type:\s*"disabled"\s*}/);
});

test("world director snapshot insert casts reused session parameter for PostgreSQL", () => {
  const engine = readFileSync("src/lib/worldEngine/engine.ts", "utf8");
  const snapshotStart = engine.indexOf("INSERT INTO world_engine_agenda_snapshots");
  const snapshotEnd = engine.indexOf("const wr = await client.query", snapshotStart);
  const snapshotInsert = engine.slice(snapshotStart, snapshotEnd);

  assert.match(snapshotInsert, /\$2::varchar/);
  assert.match(snapshotInsert, /WHERE session_id = \$2::varchar/);
});
