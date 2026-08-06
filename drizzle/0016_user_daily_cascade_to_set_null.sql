ALTER TABLE "user_daily_activity" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_daily_activity" DROP CONSTRAINT "user_daily_activity_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_daily_activity" ADD CONSTRAINT "user_daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_daily_tokens" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_daily_tokens" DROP CONSTRAINT "user_daily_tokens_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_daily_tokens" ADD CONSTRAINT "user_daily_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
