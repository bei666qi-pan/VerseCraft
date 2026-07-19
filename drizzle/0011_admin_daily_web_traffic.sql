-- Beijing-day product-event web traffic. Independent from legacy UTC admin metrics.
CREATE TABLE IF NOT EXISTS "web_traffic_daily" (
  "date_key" date PRIMARY KEY NOT NULL,
  "page_views" integer DEFAULT 0 NOT NULL,
  "unique_visitors" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "web_traffic_daily_date_key_idx" ON "web_traffic_daily" ("date_key");
