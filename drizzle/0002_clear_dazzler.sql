PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_account_members` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text,
	`phone` text,
	`display_name` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invited_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	`device_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_account_members`("id", "account_id", "user_id", "phone", "display_name", "role", "status", "invited_by", "created_at", "updated_at", "created_by", "updated_by", "device_id", "deleted_at") SELECT "id", "account_id", "user_id", "phone", "display_name", "role", "status", "invited_by", "created_at", "updated_at", "created_by", "updated_by", "device_id", "deleted_at" FROM `account_members`;--> statement-breakpoint
DROP TABLE `account_members`;--> statement-breakpoint
ALTER TABLE `__new_account_members` RENAME TO `account_members`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `members_account_idx` ON `account_members` (`account_id`);