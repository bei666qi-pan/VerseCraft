-- Phase-2: 回合节奏账本 + 叙事伏笔账本。
-- 新增表，仅 additive。运行时表缺失必须 fail-open。
CREATE TABLE IF NOT EXISTS "narrative_pacing_ledger" (
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
DO $$ BEGIN
 ALTER TABLE "narrative_pacing_ledger" ADD CONSTRAINT "narrative_pacing_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "narrative_pacing_ledger_session_turn_idx" ON "narrative_pacing_ledger" ("session_id", "turn_index");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "narrative_foreshadow_ledger" (
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
DO $$ BEGIN
 ALTER TABLE "narrative_foreshadow_ledger" ADD CONSTRAINT "narrative_foreshadow_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "narrative_foreshadow_ledger_session_status_idx" ON "narrative_foreshadow_ledger" ("session_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "narrative_foreshadow_ledger_session_due_idx" ON "narrative_foreshadow_ledger" ("session_id", "status", "deadline_turn");
