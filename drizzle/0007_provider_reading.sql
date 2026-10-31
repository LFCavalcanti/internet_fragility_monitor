ALTER TABLE `status_checks` ADD `no_source_answered` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `status_checks` ADD `feeds` text;--> statement-breakpoint
CREATE INDEX `status_checks_provider_checked_at` ON `status_checks` (`provider_id`,`checked_at`);