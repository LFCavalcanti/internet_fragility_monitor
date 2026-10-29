ALTER TABLE `incidents` ADD `kind` text DEFAULT 'problem' NOT NULL;--> statement-breakpoint
ALTER TABLE `incidents` ADD `scheduled_for` integer;