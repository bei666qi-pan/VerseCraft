CREATE TABLE IF NOT EXISTS `game_session_memory` (
	`user_id` varchar(191) NOT NULL,
	`plot_summary` text,
	`player_status` json,
	`npc_relationships` json,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_session_memory_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `game_session_memory` ADD CONSTRAINT `game_session_memory_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
