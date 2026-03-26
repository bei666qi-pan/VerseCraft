-- 问卷落库 + 游客开放反馈。在目标库执行或 `npx drizzle-kit push`。
ALTER TABLE "feedbacks" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "feedbacks" ADD COLUMN IF NOT EXISTS "guest_id" varchar(128);
--> statement-breakpoint
ALTER TABLE "feedbacks" ADD COLUMN IF NOT EXISTS "kind" varchar(24) DEFAULT 'open' NOT NULL;
--> statement-breakpoint
ALTER TABLE "feedbacks" ADD COLUMN IF NOT EXISTS "client_meta" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedbacks_guest_id_idx" ON "feedbacks" USING btree ("guest_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedbacks_user_id_idx" ON "feedbacks" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedbacks_created_idx" ON "feedbacks" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "survey_responses" (
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
DO $$ BEGIN
 ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_responses_key_user_idx" ON "survey_responses" USING btree ("survey_key","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_responses_key_guest_idx" ON "survey_responses" USING btree ("survey_key","guest_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "survey_responses_created_idx" ON "survey_responses" USING btree ("created_at");
