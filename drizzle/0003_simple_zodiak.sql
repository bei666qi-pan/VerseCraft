CREATE TABLE `admin_stats_snapshots` (
	`date` date NOT NULL,
	`total_users` int NOT NULL DEFAULT 0,
	`total_tokens` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `admin_stats_snapshots_date` PRIMARY KEY(`date`)
);
--> statement-breakpoint
ALTER TABLE `users_quota` MODIFY COLUMN `last_action_date` date NOT NULL DEFAULT (CURDATE());