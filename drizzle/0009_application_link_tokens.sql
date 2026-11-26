CREATE TABLE `application_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer,
	`rotated_at` integer,
	`revoked_at` integer,
	`last_used_at` integer,
	`links_created` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `application_link_tokens_token_hash_unique` ON `application_link_tokens` (`token_hash`);
--> statement-breakpoint
INSERT INTO `application_link_tokens` (`id`, `name`) VALUES ('environment', 'NUXT_LINK_CREATE_TOKEN');
