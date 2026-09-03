-- Runtime readers/writers were removed before this migration. Migration
-- history is retained; only obsolete projections are dropped.
-- Intentionally no CASCADE: unexpected dependencies must stop the rollout.
DROP TABLE IF EXISTS "world_engine_agenda_snapshots";--> statement-breakpoint
DROP TABLE IF EXISTS "world_engine_hint_envelopes";--> statement-breakpoint
DROP TABLE IF EXISTS "user_sessions";--> statement-breakpoint
DROP TABLE IF EXISTS "user_daily_activity";--> statement-breakpoint
DROP TABLE IF EXISTS "user_daily_tokens";--> statement-breakpoint
DROP TABLE IF EXISTS "guest_daily_activity";--> statement-breakpoint
DROP TABLE IF EXISTS "guest_daily_tokens";--> statement-breakpoint
DROP TABLE IF EXISTS "vc_semantic_cache";
