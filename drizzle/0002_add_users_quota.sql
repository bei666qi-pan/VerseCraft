CREATE TABLE `users_quota` (
	`user_id` varchar(191) NOT NULL,
	`daily_tokens` int unsigned NOT NULL DEFAULT 0,
	`daily_actions` int unsigned NOT NULL DEFAULT 0,
	`last_action_date` date NOT NULL DEFAULT CURDATE(),
	`is_banned` boolean NOT NULL DEFAULT false,
	CONSTRAINT `users_quota_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `users_quota` ADD CONSTRAINT `users_quota_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;