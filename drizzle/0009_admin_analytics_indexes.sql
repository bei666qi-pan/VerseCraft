-- Admin analytics query indexes.
-- Additive only; rollback by dropping these indexes if needed.
CREATE INDEX IF NOT EXISTS "analytics_events_event_name_time_idx"
  ON "analytics_events" ("event_name", "event_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_actor_event_time_idx"
  ON "analytics_events" ("actor_id", "event_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_guest_event_time_idx"
  ON "analytics_events" ("guest_id", "event_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_session_event_time_idx"
  ON "analytics_events" ("session_id", "event_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_payload_world_id_time_idx"
  ON "analytics_events" ((payload->>'worldId'), "event_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_responses_created_key_idx"
  ON "survey_responses" ("created_at", "survey_key");
