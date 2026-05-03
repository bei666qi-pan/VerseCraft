-- Narrative ledger foundation: append-only story events, run logs, and first-class NPC memories.
CREATE TABLE IF NOT EXISTS "story_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"request_id" varchar(191) NOT NULL,
	"session_id" varchar(191),
	"user_id" varchar(191),
	"turn_index" integer DEFAULT 0 NOT NULL,
	"world_id" varchar(64) DEFAULT 'base_apartment' NOT NULL,
	"chapter_id" varchar(64),
	"scene_id" varchar(128),
	"actor_type" varchar(24) NOT NULL,
	"actor_id" varchar(128),
	"event_type" varchar(64) NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"committed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_events" ADD CONSTRAINT "story_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_events_session_turn_idx" ON "story_events" USING btree ("session_id","turn_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_events_user_created_idx" ON "story_events" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_events_actor_idx" ON "story_events" USING btree ("actor_type","actor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_events_event_type_idx" ON "story_events" USING btree ("event_type");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "narrative_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"request_id" varchar(191) NOT NULL,
	"session_id" varchar(191),
	"user_id" varchar(191),
	"turn_index" integer DEFAULT 0 NOT NULL,
	"ttft_ms" integer,
	"total_latency_ms" integer,
	"lore_hit_count" integer DEFAULT 0 NOT NULL,
	"validator_issue_count" integer DEFAULT 0 NOT NULL,
	"degrade_reason" varchar(128),
	"commit_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "narrative_runs" ADD CONSTRAINT "narrative_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "narrative_runs_request_unique" ON "narrative_runs" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "narrative_runs_session_turn_idx" ON "narrative_runs" USING btree ("session_id","turn_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "narrative_runs_created_idx" ON "narrative_runs" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "npc_memory_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"npc_id" varchar(128) NOT NULL,
	"session_id" varchar(191),
	"user_id" varchar(191),
	"scope" varchar(32) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"summary" text NOT NULL,
	"fact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"salience" integer DEFAULT 50 NOT NULL,
	"confidence" integer DEFAULT 80 NOT NULL,
	"emotion" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "npc_memory_entries" ADD CONSTRAINT "npc_memory_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "npc_memory_entries_npc_session_idx" ON "npc_memory_entries" USING btree ("npc_id","session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "npc_memory_entries_user_npc_idx" ON "npc_memory_entries" USING btree ("user_id","npc_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "npc_memory_entries_salience_idx" ON "npc_memory_entries" USING btree ("salience");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "npc_memory_entries_updated_idx" ON "npc_memory_entries" USING btree ("updated_at");
