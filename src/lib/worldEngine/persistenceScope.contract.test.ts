import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Director migrations stage additive backfill before scope finalization", () => {
  const phaseOne = readFileSync("drizzle/0020_unify_world_director_runtime.sql", "utf8");
  const phaseTwo = readFileSync("drizzle/0021_finalize_world_director_scope.sql", "utf8");
  for (const table of [
    "world_engine_runs",
    "world_engine_event_queue",
    "world_engine_agenda_snapshots",
    "world_engine_director_state",
    "npc_agent_state",
  ]) {
    assert.match(phaseOne, new RegExp(`UPDATE \\"${table}\\" SET \\"world_id\\" = 'dark_moon_prologue', \\"map_id\\" = 'dark_moon_apartment'`));
  }
  assert.match(phaseOne, /world_engine_runs_scope_dedup_unique/);
  assert.match(phaseOne, /vc_jobs_type_idempotency_unique/);
  assert.match(phaseOne, /world_engine_hint_envelopes_scope_turn_idx/);
  assert.doesNotMatch(phaseOne, /ALTER COLUMN "world_id" SET NOT NULL/);
  assert.match(phaseTwo, /world_id IS NULL OR map_id IS NULL/);
  assert.match(phaseTwo, /ALTER COLUMN "world_id" SET NOT NULL/);
  assert.match(phaseTwo, /DROP INDEX IF EXISTS "world_engine_runs_dedup_unique"/);
});

test("runtime schema bootstrap cannot bypass phase-two scope verification", () => {
  const source = readFileSync("src/db/ensureSchema.ts", "utf8");
  const worldEngineStart = source.indexOf("// ========= World Engine");
  const worldEngineEnd = source.indexOf("CREATE TABLE IF NOT EXISTS npc_relation_edges", worldEngineStart);
  const worldEngineBootstrap = source.slice(worldEngineStart, worldEngineEnd);

  assert.match(worldEngineBootstrap, /world_engine_runs_scope_dedup_unique/);
  assert.match(worldEngineBootstrap, /world_engine_hint_envelopes_scope_turn_idx/);
  assert.doesNotMatch(worldEngineBootstrap, /ALTER COLUMN world_id SET NOT NULL/);
  assert.doesNotMatch(worldEngineBootstrap, /ALTER COLUMN map_id SET NOT NULL/);
  assert.doesNotMatch(worldEngineBootstrap, /DROP INDEX IF EXISTS world_engine_runs_dedup_unique/);
  assert.doesNotMatch(worldEngineBootstrap, /DROP CONSTRAINT IF EXISTS world_engine_agenda_session_revision_unique/);
});

test("Director reasoner tools require exact world/map/session scope", () => {
  const source = readFileSync("src/lib/worldEngine/directorTools.ts", "utf8");
  assert.match(source, /interface DirectorToolScope extends WorldRuntimeScope/);
  assert.match(source, /world_id = \$1 AND map_id = \$2 AND session_id = \$3/);
  assert.match(source, /c\.world_id = \$3/);
  assert.match(source, /c\.map_id = \$4/);
});

test("output transaction contains agenda, state, hint, and run success before COMMIT", () => {
  const source = readFileSync("src/lib/worldEngine/engine.ts", "utf8");
  const begin = source.indexOf('await client.query("BEGIN")', source.indexOf("writeWorldEngineOutputs"));
  const social = source.indexOf("applySocialGmDeltas", begin);
  const materialize = source.indexOf("materializeAcceptedDirectorPlan", social);
  const agenda = source.indexOf("insertDirectorAgendaItems", begin);
  const state = source.indexOf("saveDirectorState", agenda);
  const hint = source.indexOf("insertDirectorHintEnvelope", state);
  const succeeded = source.indexOf("status = 'succeeded'", hint);
  const commit = source.indexOf('await client.query("COMMIT")', succeeded);
  const rollback = source.indexOf('await client.query("ROLLBACK")', commit);
  assert.ok(begin >= 0 && social > begin && materialize > social && agenda > materialize && state > agenda && hint > state && succeeded > hint && commit > succeeded);
  assert.ok(rollback > commit);
});

test("prompt hint lookup always uses compound scope and an applicability window", () => {
  const source = readFileSync("src/lib/worldEngine/hintRepository.ts", "utf8");
  assert.match(source, /world_id = \$1 AND map_id = \$2 AND session_id = \$3/);
  assert.match(source, /valid_from_turn <= \$4 AND valid_through_turn >= \$4/);
  assert.match(source, /timeoutMs \?\? 80/);
});

test("Writer prompt assembly reads committed envelopes only for both worlds", () => {
  const source = readFileSync("src/lib/playRealtime/promptAssembly.ts", "utf8");
  const consumer = readFileSync("src/lib/worldEngine/writerHintConsumer.ts", "utf8");
  assert.match(source, /loadCommittedDirectorHintForWriter/);
  assert.match(consumer, /loadApplicableDirectorHintEnvelope/);
  assert.match(consumer, /renderDirectorHintEnvelope/);
  assert.match(source, /worldId: isXingni \? XINGNI_WORLD_ID : DARK_MOON_WORLD_ID/);
  assert.match(source, /mapId: isXingni \? QINGSHI_MAP_ID : DARK_MOON_MAP_ID/);
  assert.doesNotMatch(source, /loadDirectorState/);
  assert.doesNotMatch(source, /loadDueDirectorAgenda\(/);
});
