CREATE TABLE IF NOT EXISTS `user_onboarding` (
	`user_id` varchar(191) NOT NULL,
	`codex_first_view_done` int unsigned NOT NULL DEFAULT 0,
	`warehouse_first_view_done` int unsigned NOT NULL DEFAULT 0,
	`tasks_first_view_done` int unsigned NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_onboarding_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `user_onboarding` ADD CONSTRAINT `user_onboarding_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
