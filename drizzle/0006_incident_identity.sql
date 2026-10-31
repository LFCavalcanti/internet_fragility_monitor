ALTER TABLE `incidents` ADD `source_id` text REFERENCES provider_sources(id);--> statement-breakpoint
ALTER TABLE `incidents` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `incidents_source_external_unique` ON `incidents` (`source_id`,`external_id`);