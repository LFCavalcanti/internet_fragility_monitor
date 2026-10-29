CREATE TABLE `provider_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`kind` text NOT NULL,
	`family` text,
	`url` text NOT NULL,
	`label` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `providers` ADD `status_page_url` text;--> statement-breakpoint
ALTER TABLE `providers` ADD `is_major` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `providers` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `providers` ADD `display_order` integer DEFAULT 0 NOT NULL;