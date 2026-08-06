CREATE TABLE "vc_semantic_cache" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cache_scope" text NOT NULL,
	"task" text NOT NULL,
	"user_id" varchar(191),
	"world_revision" bigint NOT NULL,
	"request_embedding" text NOT NULL,
	"request_norm" text,
	"request_text_preview" text,
	"request_hash" text NOT NULL,
	"response_text" text NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"hit_count" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "vc_semantic_cache_request_hash_unique" UNIQUE("request_hash")
);
--> statement-breakpoint
CREATE TABLE "vc_world_fact" (
	"fact_id" bigserial PRIMARY KEY NOT NULL,
	"canonical_text" text NOT NULL,
	"normalized_hash" text NOT NULL,
	"embedding" text NOT NULL,
	"is_hot" boolean DEFAULT true NOT NULL,
	"last_hit_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "vc_world_fact_normalized_hash_unique" UNIQUE("normalized_hash")
);
--> statement-breakpoint
ALTER TABLE "user_daily_activity" DROP CONSTRAINT "user_daily_activity_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_daily_tokens" DROP CONSTRAINT "user_daily_tokens_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "admin_stats_snapshots" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_stats_snapshots" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "feedbacks" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedbacks" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "game_session_memory" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_session_memory" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "save_slots" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "save_slots" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "user_daily_activity" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_daily_tokens" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_onboarding" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_onboarding" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_data_reset" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_data_reset" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_active" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_active" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "vc_semantic_cache" ADD CONSTRAINT "vc_semantic_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vc_semantic_cache_ivfflat_global_codex" ON "vc_semantic_cache" USING btree ("request_embedding") WHERE "vc_semantic_cache"."cache_scope" = 'global' AND "vc_semantic_cache"."is_valid" = TRUE AND "vc_semantic_cache"."task" = 'codex';--> statement-breakpoint
CREATE INDEX "vc_world_fact_ivfflat_hot" ON "vc_world_fact" USING btree ("embedding") WHERE "vc_world_fact"."is_hot" = TRUE;--> statement-breakpoint
ALTER TABLE "actor_sessions" ADD CONSTRAINT "actor_sessions_actor_fk" FOREIGN KEY ("actor_id","actor_type") REFERENCES "public"."analytics_actors"("actor_id","actor_type") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_activity" ADD CONSTRAINT "user_daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_tokens" ADD CONSTRAINT "user_daily_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_actors" ADD CONSTRAINT "analytics_actors_actor_id_type_key" UNIQUE("actor_id","actor_type");--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_kind_check" CHECK (kind IN ('bug','feature','content','other','open'));