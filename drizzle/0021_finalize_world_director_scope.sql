-- Phase 2: run only after Phase 1 has been deployed and null-scope monitoring is clean.
-- This migration intentionally retains all additive columns/tables on rollback.
DO $$
DECLARE
  table_name text;
  has_null_scope boolean;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'world_engine_runs',
    'world_engine_event_queue',
    'world_engine_agenda_snapshots',
    'world_engine_director_state',
    'npc_agent_state'
  ]
  LOOP
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %I WHERE world_id IS NULL OR map_id IS NULL)',
      table_name
    ) INTO has_null_scope;
    IF has_null_scope THEN
      RAISE EXCEPTION 'Director scope finalization blocked: %.world_id/map_id still contains NULL', table_name;
    END IF;
  END LOOP;
END $$;

ALTER TABLE "world_engine_runs" ALTER COLUMN "world_id" DROP DEFAULT;
ALTER TABLE "world_engine_runs" ALTER COLUMN "map_id" DROP DEFAULT;
ALTER TABLE "world_engine_runs" ALTER COLUMN "world_id" SET NOT NULL;
ALTER TABLE "world_engine_runs" ALTER COLUMN "map_id" SET NOT NULL;
ALTER TABLE "world_engine_event_queue" ALTER COLUMN "world_id" DROP DEFAULT;
ALTER TABLE "world_engine_event_queue" ALTER COLUMN "map_id" DROP DEFAULT;
ALTER TABLE "world_engine_event_queue" ALTER COLUMN "world_id" SET NOT NULL;
ALTER TABLE "world_engine_event_queue" ALTER COLUMN "map_id" SET NOT NULL;
ALTER TABLE "world_engine_agenda_snapshots" ALTER COLUMN "world_id" DROP DEFAULT;
ALTER TABLE "world_engine_agenda_snapshots" ALTER COLUMN "map_id" DROP DEFAULT;
ALTER TABLE "world_engine_agenda_snapshots" ALTER COLUMN "world_id" SET NOT NULL;
ALTER TABLE "world_engine_agenda_snapshots" ALTER COLUMN "map_id" SET NOT NULL;
ALTER TABLE "world_engine_director_state" ALTER COLUMN "world_id" DROP DEFAULT;
ALTER TABLE "world_engine_director_state" ALTER COLUMN "map_id" DROP DEFAULT;
ALTER TABLE "world_engine_director_state" ALTER COLUMN "world_id" SET NOT NULL;
ALTER TABLE "world_engine_director_state" ALTER COLUMN "map_id" SET NOT NULL;
ALTER TABLE "npc_agent_state" ALTER COLUMN "world_id" DROP DEFAULT;
ALTER TABLE "npc_agent_state" ALTER COLUMN "map_id" DROP DEFAULT;
ALTER TABLE "npc_agent_state" ALTER COLUMN "world_id" SET NOT NULL;
ALTER TABLE "npc_agent_state" ALTER COLUMN "map_id" SET NOT NULL;

DROP INDEX IF EXISTS "world_engine_runs_dedup_unique";
DROP INDEX IF EXISTS "world_engine_director_state_session_unique";
DROP INDEX IF EXISTS "npc_agent_state_session_npc_unique";
DROP INDEX IF EXISTS "world_engine_event_queue_director_dedup_unique";
ALTER TABLE "world_engine_agenda_snapshots"
  DROP CONSTRAINT IF EXISTS "world_engine_agenda_session_revision_unique";
DROP INDEX IF EXISTS "world_engine_agenda_session_revision_unique";
