-- 账号结算履历（与 Drizzle `settlementHistories` 表一致）。在 DATABASE_URL 指向的库中执行，或使用 `npx drizzle-kit push`。
CREATE TABLE IF NOT EXISTS "settlement_histories" (
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
DO $$ BEGIN
 ALTER TABLE "settlement_histories" ADD CONSTRAINT "settlement_histories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlement_histories_user_created_idx" ON "settlement_histories" USING btree ("user_id","created_at");
