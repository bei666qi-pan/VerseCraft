-- Normalize timestamp columns to timestamptz for cross-environment consistency.
-- These 6 tables used timestamp without time zone while all others use timestamptz.
-- The ALTER COLUMN statements are idempotent — safe to run on databases where
-- ensureSchema.ts already created the columns as TIMESTAMPTZ.

ALTER TABLE "users" ALTER COLUMN "last_data_reset" TYPE timestamptz;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_active" TYPE timestamptz;
--> statement-breakpoint
ALTER TABLE "feedbacks" ALTER COLUMN "created_at" TYPE timestamptz;
--> statement-breakpoint
ALTER TABLE "game_session_memory" ALTER COLUMN "updated_at" TYPE timestamptz;
--> statement-breakpoint
ALTER TABLE "user_onboarding" ALTER COLUMN "updated_at" TYPE timestamptz;
--> statement-breakpoint
ALTER TABLE "save_slots" ALTER COLUMN "updated_at" TYPE timestamptz;
--> statement-breakpoint
ALTER TABLE "admin_stats_snapshots" ALTER COLUMN "created_at" TYPE timestamptz;
