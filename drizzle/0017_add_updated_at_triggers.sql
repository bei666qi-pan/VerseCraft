-- Add $onUpdate (CURRENT_TIMESTAMP) triggers to updated_at columns that were missing them.
-- These triggers mirror what Drizzle's .$onUpdate(() => sql`CURRENT_TIMESTAMP`) generates
-- at the PostgreSQL level — they auto-set updated_at on every row UPDATE.
--
-- Tables covered:
--   actor_sessions, user_sessions (legacy dead), guest_registry, admin_metrics_daily,
--   web_traffic_daily, world_engine_director_state, npc_agent_state, npc_relation_edges,
--   social_event_ledger
--
-- All statements are idempotent (CREATE OR REPLACE FUNCTION, trigger guarded by NOT EXISTS).

-- actor_sessions
CREATE OR REPLACE FUNCTION update_actor_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_actor_sessions_updated_at') THEN
    CREATE TRIGGER update_actor_sessions_updated_at
      BEFORE UPDATE ON "actor_sessions"
      FOR EACH ROW EXECUTE FUNCTION update_actor_sessions_updated_at();
  END IF;
END $$;

-- user_sessions (legacy dead table, but keep schema consistent)
CREATE OR REPLACE FUNCTION update_user_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_sessions_updated_at') THEN
    CREATE TRIGGER update_user_sessions_updated_at
      BEFORE UPDATE ON "user_sessions"
      FOR EACH ROW EXECUTE FUNCTION update_user_sessions_updated_at();
  END IF;
END $$;

-- guest_registry
CREATE OR REPLACE FUNCTION update_guest_registry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_guest_registry_updated_at') THEN
    CREATE TRIGGER update_guest_registry_updated_at
      BEFORE UPDATE ON "guest_registry"
      FOR EACH ROW EXECUTE FUNCTION update_guest_registry_updated_at();
  END IF;
END $$;

-- admin_metrics_daily
CREATE OR REPLACE FUNCTION update_admin_metrics_daily_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_admin_metrics_daily_updated_at') THEN
    CREATE TRIGGER update_admin_metrics_daily_updated_at
      BEFORE UPDATE ON "admin_metrics_daily"
      FOR EACH ROW EXECUTE FUNCTION update_admin_metrics_daily_updated_at();
  END IF;
END $$;

-- web_traffic_daily
CREATE OR REPLACE FUNCTION update_web_traffic_daily_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_web_traffic_daily_updated_at') THEN
    CREATE TRIGGER update_web_traffic_daily_updated_at
      BEFORE UPDATE ON "web_traffic_daily"
      FOR EACH ROW EXECUTE FUNCTION update_web_traffic_daily_updated_at();
  END IF;
END $$;

-- world_engine_director_state
CREATE OR REPLACE FUNCTION update_world_engine_director_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_world_engine_director_state_updated_at') THEN
    CREATE TRIGGER update_world_engine_director_state_updated_at
      BEFORE UPDATE ON "world_engine_director_state"
      FOR EACH ROW EXECUTE FUNCTION update_world_engine_director_state_updated_at();
  END IF;
END $$;

-- npc_agent_state
CREATE OR REPLACE FUNCTION update_npc_agent_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_npc_agent_state_updated_at') THEN
    CREATE TRIGGER update_npc_agent_state_updated_at
      BEFORE UPDATE ON "npc_agent_state"
      FOR EACH ROW EXECUTE FUNCTION update_npc_agent_state_updated_at();
  END IF;
END $$;

-- npc_relation_edges
CREATE OR REPLACE FUNCTION update_npc_relation_edges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_npc_relation_edges_updated_at') THEN
    CREATE TRIGGER update_npc_relation_edges_updated_at
      BEFORE UPDATE ON "npc_relation_edges"
      FOR EACH ROW EXECUTE FUNCTION update_npc_relation_edges_updated_at();
  END IF;
END $$;

-- social_event_ledger
CREATE OR REPLACE FUNCTION update_social_event_ledger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_social_event_ledger_updated_at') THEN
    CREATE TRIGGER update_social_event_ledger_updated_at
      BEFORE UPDATE ON "social_event_ledger"
      FOR EACH ROW EXECUTE FUNCTION update_social_event_ledger_updated_at();
  END IF;
END $$;
