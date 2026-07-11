-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "actor_daily_tokens" (
	"actor_id" varchar(191) NOT NULL,
	"actor_type" varchar(16) NOT NULL,
	"user_id" varchar(191),
	"guest_id" varchar(128),
	"date_key" date NOT NULL,
	"daily_token_cost" integer DEFAULT 0 NOT NULL,
	"chat_action_count" integer DEFAULT 0 NOT NULL,
	"active_play_sec" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actor_sessions" (
	"session_id" varchar(191) PRIMARY KEY NOT NULL,
	"actor_id" varchar(191) NOT NULL,
	"actor_type" varchar(16) NOT NULL,
	"user_id" varchar(191),
	"guest_id" varchar(128),
	"started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_page" text,
	"total_token_cost" integer DEFAULT 0 NOT NULL,
	"chat_action_count" integer DEFAULT 0 NOT NULL,
	"online_sec" integer DEFAULT 0 NOT NULL,
	"active_play_sec" integer DEFAULT 0 NOT NULL,
	"read_sec" integer DEFAULT 0 NOT NULL,
	"idle_sec" integer DEFAULT 0 NOT NULL,
	"last_presence_ok_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_actors" (
	"actor_id" varchar(191) PRIMARY KEY NOT NULL,
	"actor_type" varchar(16) NOT NULL,
	"user_id" varchar(191),
	"guest_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"action" varchar(96) NOT NULL,
	"actor" varchar(96) NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"reason" varchar(191),
	"ip_hash" varchar(64),
	"user_agent_hash" varchar(64),
	"target_type" varchar(64),
	"target_id" varchar(191),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_metrics_daily" (
	"date_key" date PRIMARY KEY NOT NULL,
	"dau" integer DEFAULT 0 NOT NULL,
	"wau" integer DEFAULT 0 NOT NULL,
	"mau" integer DEFAULT 0 NOT NULL,
	"new_users" integer DEFAULT 0 NOT NULL,
	"total_token_cost" integer DEFAULT 0 NOT NULL,
	"total_play_duration_sec" integer DEFAULT 0 NOT NULL,
	"chat_actions" integer DEFAULT 0 NOT NULL,
	"feedback_submitted_count" integer DEFAULT 0 NOT NULL,
	"game_completed_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_stats_snapshots" (
	"date" date PRIMARY KEY NOT NULL,
	"total_users" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"active_users" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_analysis_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"task" varchar(64) NOT NULL,
	"scope_key" varchar(191) NOT NULL,
	"input_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_role" varchar(32) DEFAULT 'none' NOT NULL,
	"data_revision" varchar(128) DEFAULT '' NOT NULL,
	"stale_at" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"event_id" varchar(191) PRIMARY KEY NOT NULL,
	"actor_id" varchar(191),
	"actor_type" varchar(16),
	"guest_id" varchar(128),
	"user_id" varchar(191),
	"session_id" varchar(191) NOT NULL,
	"event_name" varchar(64) NOT NULL,
	"event_time" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"page" text,
	"source" text,
	"platform" text,
	"environment" varchar(16) DEFAULT 'production' NOT NULL,
	"token_cost" integer DEFAULT 0 NOT NULL,
	"play_duration_delta_sec" integer DEFAULT 0 NOT NULL,
	"online_duration_delta_sec" integer DEFAULT 0 NOT NULL,
	"active_play_duration_delta_sec" integer DEFAULT 0 NOT NULL,
	"read_duration_delta_sec" integer DEFAULT 0 NOT NULL,
	"idle_duration_delta_sec" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" varchar(191) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_inquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"topic" varchar(32) NOT NULL,
	"contact_line" varchar(512),
	"body" text NOT NULL,
	"user_id" varchar(191),
	"ip_hash" varchar(64),
	"client_meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedbacks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191),
	"guest_id" varchar(128),
	"content" text NOT NULL,
	"kind" varchar(24) DEFAULT 'open' NOT NULL,
	"client_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actor_daily_activity" (
	"actor_id" varchar(191) NOT NULL,
	"actor_type" varchar(16) NOT NULL,
	"user_id" varchar(191),
	"guest_id" varchar(128),
	"date_key" date NOT NULL,
	"first_active_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"chat_action_count" integer DEFAULT 0 NOT NULL,
	"online_sec" integer DEFAULT 0 NOT NULL,
	"active_play_sec" integer DEFAULT 0 NOT NULL,
	"read_sec" integer DEFAULT 0 NOT NULL,
	"idle_sec" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_aliases" (
	"guest_id" varchar(128) PRIMARY KEY NOT NULL,
	"guest_no" bigserial NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "guest_aliases_guest_no_unique" UNIQUE("guest_no")
);
--> statement-breakpoint
CREATE TABLE "guest_daily_activity" (
	"guest_id" varchar(128) NOT NULL,
	"date_key" date NOT NULL,
	"first_active_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"chat_action_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_daily_tokens" (
	"guest_id" varchar(128) NOT NULL,
	"date_key" date NOT NULL,
	"daily_token_cost" integer DEFAULT 0 NOT NULL,
	"daily_play_duration_sec" integer DEFAULT 0 NOT NULL,
	"chat_action_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_registry" (
	"guest_id" varchar(128) PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"total_play_duration_sec" integer DEFAULT 0 NOT NULL,
	"ua" text,
	"ip_hash" varchar(64),
	"platform" varchar(32) DEFAULT 'unknown' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narrative_foreshadow_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(191) NOT NULL,
	"user_id" varchar(191),
	"seed_text" text NOT NULL,
	"source" varchar(24) NOT NULL,
	"planted_turn" integer NOT NULL,
	"status" varchar(24) DEFAULT 'planted' NOT NULL,
	"deadline_turn" integer,
	"importance" integer DEFAULT 0 NOT NULL,
	"payoff_turn" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_agent_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(191) NOT NULL,
	"user_id" varchar(191),
	"npc_id" varchar(128) NOT NULL,
	"state_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'idle' NOT NULL,
	"last_active_turn" integer DEFAULT 0 NOT NULL,
	"next_eligible_turn" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_memory_entries" (
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
CREATE TABLE "npc_relation_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(191) NOT NULL,
	"user_id" varchar(191),
	"from_npc_id" varchar(128) NOT NULL,
	"to_npc_id" varchar(128) NOT NULL,
	"edge_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_echo_canon" (
	"user_id" varchar(191) PRIMARY KEY NOT NULL,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"total_deaths" integer DEFAULT 0 NOT NULL,
	"endings_seen" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"highest_floor_score" integer DEFAULT 0 NOT NULL,
	"repeated_death_causes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recurring_npc_bonds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unresolved_regrets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"strongest_choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stable_echo_summary" text DEFAULT '' NOT NULL,
	"last_run_summary" text DEFAULT '' NOT NULL,
	"echo_intensity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_echo_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" varchar(191),
	"run_id" varchar(191),
	"event_type" varchar(64),
	"target_type" varchar(32),
	"target_id" varchar(128),
	"summary" text NOT NULL,
	"emotional_weight" integer DEFAULT 50 NOT NULL,
	"safety_level" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narrative_pacing_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(191) NOT NULL,
	"user_id" varchar(191),
	"turn_index" integer NOT NULL,
	"register" varchar(24),
	"beat" varchar(24),
	"hook_type" varchar(24),
	"imagery_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_payoff" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narrative_runs" (
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
CREATE TABLE "safety_audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"trace_id" varchar(191) NOT NULL,
	"scene" varchar(64) NOT NULL,
	"stage" varchar(16) NOT NULL,
	"decision" varchar(16) NOT NULL,
	"risk_level" varchar(16) NOT NULL,
	"reason_code" varchar(128) NOT NULL,
	"content_fingerprint" varchar(64) NOT NULL,
	"actor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"whitelist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_histories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"grade" varchar(2) NOT NULL,
	"survival_time_seconds" integer NOT NULL,
	"survival_day" integer DEFAULT 0 NOT NULL,
	"survival_hour" integer DEFAULT 0 NOT NULL,
	"killed_anomalies" integer DEFAULT 0 NOT NULL,
	"max_floor_score" integer DEFAULT 0 NOT NULL,
	"max_floor_label" varchar(64) DEFAULT '' NOT NULL,
	"profession" varchar(64),
	"recap_summary" text NOT NULL,
	"ai_recap_summary" text,
	"is_dead" boolean NOT NULL,
	"has_escaped" boolean DEFAULT false NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"writing_markdown" text
);
--> statement-breakpoint
CREATE TABLE "social_event_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" varchar(191) NOT NULL,
	"user_id" varchar(191),
	"event_id" varchar(128) NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"actor_key" varchar(512) NOT NULL,
	"target_key" varchar(512) NOT NULL,
	"dedup_key" varchar(191) NOT NULL,
	"turn_index" integer DEFAULT 0 NOT NULL,
	"due_turn_index" integer DEFAULT 0 NOT NULL,
	"expires_turn_index" integer,
	"visibility" varchar(32) NOT NULL,
	"player_relevance" varchar(16) NOT NULL,
	"escape_relevance" varchar(24) DEFAULT 'none' NOT NULL,
	"knowledge_scope" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'candidate' NOT NULL,
	"event_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"projected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_events" (
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
CREATE TABLE "save_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"slot_id" varchar(64) NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users_quota" (
	"user_id" varchar(191) PRIMARY KEY NOT NULL,
	"daily_tokens" integer DEFAULT 0 NOT NULL,
	"daily_actions" integer DEFAULT 0 NOT NULL,
	"last_action_date" date DEFAULT CURRENT_DATE NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"session_id" varchar(191) PRIMARY KEY NOT NULL,
	"user_id" varchar(191),
	"started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_page" text,
	"total_token_cost" integer DEFAULT 0 NOT NULL,
	"total_play_duration_sec" integer DEFAULT 0 NOT NULL,
	"chat_action_count" integer DEFAULT 0 NOT NULL,
	"last_presence_ok_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"today_tokens_used" integer DEFAULT 0 NOT NULL,
	"play_time" integer DEFAULT 0 NOT NULL,
	"today_play_time" integer DEFAULT 0 NOT NULL,
	"last_data_reset" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_active" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_engine_agenda_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"session_id" varchar(191) NOT NULL,
	"user_id" varchar(191),
	"agenda_revision" integer NOT NULL,
	"snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"code" varchar(128) NOT NULL,
	"canonical_name" varchar(255) NOT NULL,
	"title" varchar(255),
	"summary" text,
	"detail" text,
	"scope" varchar(16) NOT NULL,
	"owner_user_id" varchar(191),
	"status" varchar(32) NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_ref" text,
	"importance" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_engine_director_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(191) NOT NULL,
	"user_id" varchar(191),
	"turn_index" integer DEFAULT 0 NOT NULL,
	"phase" varchar(24) DEFAULT 'quiet' NOT NULL,
	"pacing_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recent_director_intent" text,
	"world_revision" bigint,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_entity_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_entity_id" integer NOT NULL,
	"to_entity_id" integer NOT NULL,
	"relation_type" varchar(32) NOT NULL,
	"relation_label" text NOT NULL,
	"strength" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_entity_tags" (
	"entity_id" integer NOT NULL,
	"tag" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_player_facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"session_id" varchar(191) NOT NULL,
	"fact_type" varchar(32) NOT NULL,
	"entity_id" integer,
	"normalized_fact" text NOT NULL,
	"raw_fact" text NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"conflict_status" varchar(64),
	"approved_to_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_retrieval_cache_snapshots" (
	"cache_key" varchar(255) PRIMARY KEY NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_session_memory" (
	"user_id" varchar(191) PRIMARY KEY NOT NULL,
	"plot_summary" text,
	"player_status" jsonb,
	"npc_relationships" jsonb,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191),
	"guest_id" varchar(128),
	"survey_key" varchar(64) NOT NULL,
	"survey_version" varchar(32) NOT NULL,
	"source" varchar(64) DEFAULT 'home_modal' NOT NULL,
	"answers" jsonb NOT NULL,
	"free_text" text,
	"overall_rating" integer,
	"recommend_score" integer,
	"contact_intent" boolean DEFAULT false NOT NULL,
	"user_agreement" boolean DEFAULT false NOT NULL,
	"privacy_policy" boolean DEFAULT false NOT NULL,
	"client_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_daily_activity" (
	"user_id" varchar(191) NOT NULL,
	"date_key" date NOT NULL,
	"first_active_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"chat_action_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_daily_tokens" (
	"user_id" varchar(191) NOT NULL,
	"date_key" date NOT NULL,
	"daily_token_cost" integer DEFAULT 0 NOT NULL,
	"daily_play_duration_sec" integer DEFAULT 0 NOT NULL,
	"chat_action_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_onboarding" (
	"user_id" varchar(191) PRIMARY KEY NOT NULL,
	"codex_first_view_done" integer DEFAULT 0 NOT NULL,
	"warehouse_first_view_done" integer DEFAULT 0 NOT NULL,
	"tasks_first_view_done" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_engine_runs" (
	"run_id" serial PRIMARY KEY NOT NULL,
	"dedup_key" varchar(128) NOT NULL,
	"request_id" varchar(191) NOT NULL,
	"user_id" varchar(191),
	"session_id" varchar(191) NOT NULL,
	"trigger_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_task" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"output_json" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_engine_event_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"session_id" varchar(191) NOT NULL,
	"user_id" varchar(191),
	"event_code" varchar(128) NOT NULL,
	"title" text NOT NULL,
	"due_in_turns" integer DEFAULT 1 NOT NULL,
	"priority" varchar(16) DEFAULT 'low' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"due_turn_index" integer,
	"ttl_turns" integer,
	"expires_turn_index" integer,
	"injected_turn_index" integer,
	"resolved_turn_index" integer,
	"salience" integer DEFAULT 0 NOT NULL,
	"agency_risk" varchar(16),
	"continuity_risk" varchar(16),
	"spoiler_risk" varchar(16),
	"reveal_policy" varchar(24),
	"injection_hint" text,
	"agency_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"forbidden_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dedup_key" varchar(191),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_knowledge_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_tsv" text NOT NULL,
	"token_estimate" integer DEFAULT 0 NOT NULL,
	"importance" integer DEFAULT 0 NOT NULL,
	"visibility_scope" varchar(16) NOT NULL,
	"owner_user_id" varchar(191),
	"retrieval_key" varchar(256),
	"embedding_model" varchar(64),
	"embedding_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"embedding_vector" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actor_daily_tokens" ADD CONSTRAINT "actor_daily_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_sessions" ADD CONSTRAINT "actor_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_actors" ADD CONSTRAINT "analytics_actors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_inquiries" ADD CONSTRAINT "compliance_inquiries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_daily_activity" ADD CONSTRAINT "actor_daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_foreshadow_ledger" ADD CONSTRAINT "narrative_foreshadow_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_agent_state" ADD CONSTRAINT "npc_agent_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_memory_entries" ADD CONSTRAINT "npc_memory_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_relation_edges" ADD CONSTRAINT "npc_relation_edges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_echo_canon" ADD CONSTRAINT "player_echo_canon_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_echo_events" ADD CONSTRAINT "player_echo_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_pacing_ledger" ADD CONSTRAINT "narrative_pacing_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_runs" ADD CONSTRAINT "narrative_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_histories" ADD CONSTRAINT "settlement_histories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_event_ledger" ADD CONSTRAINT "social_event_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_events" ADD CONSTRAINT "story_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "save_slots" ADD CONSTRAINT "save_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users_quota" ADD CONSTRAINT "users_quota_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_engine_agenda_snapshots" ADD CONSTRAINT "world_engine_agenda_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_engine_agenda_snapshots" ADD CONSTRAINT "world_engine_agenda_snapshots_run_id_world_engine_runs_run_id_f" FOREIGN KEY ("run_id") REFERENCES "public"."world_engine_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_entities" ADD CONSTRAINT "world_entities_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_engine_director_state" ADD CONSTRAINT "world_engine_director_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_entity_edges" ADD CONSTRAINT "world_entity_edges_from_entity_id_world_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."world_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_entity_edges" ADD CONSTRAINT "world_entity_edges_to_entity_id_world_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."world_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_entity_tags" ADD CONSTRAINT "world_entity_tags_entity_id_world_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."world_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_player_facts" ADD CONSTRAINT "world_player_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_player_facts" ADD CONSTRAINT "world_player_facts_entity_id_world_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."world_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_session_memory" ADD CONSTRAINT "game_session_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_activity" ADD CONSTRAINT "user_daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_tokens" ADD CONSTRAINT "user_daily_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_engine_runs" ADD CONSTRAINT "world_engine_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_engine_event_queue" ADD CONSTRAINT "world_engine_event_queue_run_id_world_engine_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."world_engine_runs"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_engine_event_queue" ADD CONSTRAINT "world_engine_event_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_knowledge_chunks" ADD CONSTRAINT "world_knowledge_chunks_entity_id_world_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."world_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_knowledge_chunks" ADD CONSTRAINT "world_knowledge_chunks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actor_daily_tokens_actor_date_unique" ON "actor_daily_tokens" USING btree ("actor_id" text_ops,"date_key" text_ops);--> statement-breakpoint
CREATE INDEX "actor_daily_tokens_actor_idx" ON "actor_daily_tokens" USING btree ("actor_id" text_ops);--> statement-breakpoint
CREATE INDEX "actor_daily_tokens_date_idx" ON "actor_daily_tokens" USING btree ("date_key" date_ops);--> statement-breakpoint
CREATE INDEX "actor_daily_tokens_guest_idx" ON "actor_daily_tokens" USING btree ("guest_id" text_ops);--> statement-breakpoint
CREATE INDEX "actor_sessions_actor_last_seen_idx" ON "actor_sessions" USING btree ("actor_id" text_ops,"last_seen_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "actor_sessions_guest_last_seen_idx" ON "actor_sessions" USING btree ("guest_id" timestamptz_ops,"last_seen_at" text_ops);--> statement-breakpoint
CREATE INDEX "actor_sessions_user_last_seen_idx" ON "actor_sessions" USING btree ("user_id" text_ops,"last_seen_at" text_ops);--> statement-breakpoint
CREATE INDEX "analytics_actors_actor_type_idx" ON "analytics_actors" USING btree ("actor_type" text_ops);--> statement-breakpoint
CREATE INDEX "analytics_actors_guest_id_idx" ON "analytics_actors" USING btree ("guest_id" text_ops);--> statement-breakpoint
CREATE INDEX "analytics_actors_last_seen_idx" ON "analytics_actors" USING btree ("last_seen_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "analytics_actors_user_id_idx" ON "analytics_actors" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "admin_audit_logs_action_created_idx" ON "admin_audit_logs" USING btree ("action" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "admin_audit_logs_actor_created_idx" ON "admin_audit_logs" USING btree ("actor" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "admin_audit_logs_created_idx" ON "admin_audit_logs" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "admin_metrics_daily_date_key_idx" ON "admin_metrics_daily" USING btree ("date_key" date_ops);--> statement-breakpoint
CREATE INDEX "ai_analysis_stale_idx" ON "ai_analysis_snapshots" USING btree ("stale_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ai_analysis_task_scope_unique" ON "ai_analysis_snapshots" USING btree ("task" text_ops,"scope_key" text_ops);--> statement-breakpoint
CREATE INDEX "analytics_events_actor_event_time_idx" ON "analytics_events" USING btree ("actor_id" timestamptz_ops,"event_time" text_ops);--> statement-breakpoint
CREATE INDEX "analytics_events_event_name_time_idx" ON "analytics_events" USING btree ("event_name" timestamptz_ops,"event_time" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "analytics_events_guest_event_time_idx" ON "analytics_events" USING btree ("guest_id" timestamptz_ops,"event_time" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_events_idempotency_unique" ON "analytics_events" USING btree ("idempotency_key" text_ops);--> statement-breakpoint
CREATE INDEX "analytics_events_page_time_idx" ON "analytics_events" USING btree ("page" timestamptz_ops,"event_time" text_ops);--> statement-breakpoint
CREATE INDEX "analytics_events_session_event_time_idx" ON "analytics_events" USING btree ("session_id" timestamptz_ops,"event_time" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "analytics_events_session_id_idx" ON "analytics_events" USING btree ("session_id" text_ops);--> statement-breakpoint
CREATE INDEX "analytics_events_user_event_time_idx" ON "analytics_events" USING btree ("user_id" timestamptz_ops,"event_time" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "compliance_inquiries_created_idx" ON "compliance_inquiries" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "compliance_inquiries_ip_created_idx" ON "compliance_inquiries" USING btree ("ip_hash" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "compliance_inquiries_topic_idx" ON "compliance_inquiries" USING btree ("topic" text_ops);--> statement-breakpoint
CREATE INDEX "feedbacks_created_idx" ON "feedbacks" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "feedbacks_guest_id_idx" ON "feedbacks" USING btree ("guest_id" text_ops);--> statement-breakpoint
CREATE INDEX "feedbacks_user_id_idx" ON "feedbacks" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "actor_daily_activity_actor_date_unique" ON "actor_daily_activity" USING btree ("actor_id" text_ops,"date_key" text_ops);--> statement-breakpoint
CREATE INDEX "actor_daily_activity_actor_idx" ON "actor_daily_activity" USING btree ("actor_id" text_ops);--> statement-breakpoint
CREATE INDEX "actor_daily_activity_date_idx" ON "actor_daily_activity" USING btree ("date_key" date_ops);--> statement-breakpoint
CREATE INDEX "actor_daily_activity_guest_idx" ON "actor_daily_activity" USING btree ("guest_id" text_ops);
*/