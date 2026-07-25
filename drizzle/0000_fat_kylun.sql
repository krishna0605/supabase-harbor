CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`supabase_user_id` text NOT NULL,
	`primary_email` text NOT NULL,
	`token_ciphertext` blob NOT NULL,
	`token_nonce` blob NOT NULL,
	`token_tag` blob NOT NULL,
	`token_fingerprint` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_successful_sync_at` text,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_token_fingerprint_unique` ON `accounts` (`token_fingerprint`);--> statement-breakpoint
CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`project_ref` text NOT NULL,
	`action_type` text NOT NULL,
	`status` text NOT NULL,
	`upstream_status` text,
	`error_code` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`account_id` text NOT NULL,
	`supabase_org_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`plan` text DEFAULT 'unknown' NOT NULL,
	`last_seen_at` text NOT NULL,
	PRIMARY KEY(`account_id`, `supabase_org_id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`account_id` text NOT NULL,
	`project_ref` text NOT NULL,
	`supabase_org_id` text NOT NULL,
	`organization_slug` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`region` text NOT NULL,
	`cloud_provider` text DEFAULT 'unknown' NOT NULL,
	`raw_status` text NOT NULL,
	`lifecycle_status` text NOT NULL,
	`health_status` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`removed_at` text,
	PRIMARY KEY(`account_id`, `project_ref`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `service_health` (
	`account_id` text NOT NULL,
	`project_ref` text NOT NULL,
	`service_name` text NOT NULL,
	`healthy` integer NOT NULL,
	`raw_status` text NOT NULL,
	`version` text,
	`error_summary` text,
	`checked_at` text NOT NULL,
	PRIMARY KEY(`account_id`, `project_ref`, `service_name`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`project_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `vault_metadata` (
	`id` integer PRIMARY KEY NOT NULL,
	`format_version` integer NOT NULL,
	`kdf_salt` blob NOT NULL,
	`kdf_parameters` text NOT NULL,
	`wrapped_dek` blob NOT NULL,
	`wrapped_dek_nonce` blob NOT NULL,
	`wrapped_dek_tag` blob NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
