CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`currency` text DEFAULT 'TRY' NOT NULL,
	`cached_balance` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	`device_id` text,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `accounts_owner_idx` ON `accounts` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT 'tag' NOT NULL,
	`color` text,
	`kind` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	`device_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `categories_account_idx` ON `categories` (`account_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`note` text,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	`device_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contacts_account_idx` ON `contacts` (`account_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`tx_date` text NOT NULL,
	`kind` text NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`kasa_type` text,
	`category_id` text,
	`contact_id` text,
	`description` text,
	`description_norm` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	`device_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tx_account_date_idx` ON `transactions` (`account_id`,`tx_date`);--> statement-breakpoint
CREATE INDEX `tx_contact_idx` ON `transactions` (`contact_id`);--> statement-breakpoint
CREATE INDEX `tx_desc_idx` ON `transactions` (`account_id`,`description_norm`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`account_id` text NOT NULL,
	`tx_date` text NOT NULL,
	`ledger_type` text NOT NULL,
	`kasa_type` text,
	`category_id` text,
	`contact_id` text,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	`device_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entries_tx_idx` ON `entries` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `entries_kasa_idx` ON `entries` (`account_id`,`ledger_type`,`kasa_type`);--> statement-breakpoint
CREATE INDEX `entries_contact_idx` ON `entries` (`contact_id`);--> statement-breakpoint
CREATE INDEX `entries_category_idx` ON `entries` (`category_id`,`tx_date`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`phone` text,
	`email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	`device_id` text,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `account_members` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
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
CREATE UNIQUE INDEX `members_account_user_idx` ON `account_members` (`account_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `description_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`description_norm` text NOT NULL,
	`category_id` text,
	`contact_id` text,
	`kasa_type` text,
	`use_count` integer DEFAULT 1 NOT NULL,
	`last_used_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	`device_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `desc_sugg_idx` ON `description_suggestions` (`account_id`,`description_norm`);