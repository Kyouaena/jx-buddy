CREATE TABLE `research_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `research_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_checkpoints_thread_revision` ON `research_checkpoints` (`thread_id`,`revision`);--> statement-breakpoint
CREATE TABLE `research_memories` (
	`owner` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`goal` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_threads_owner_updated` ON `research_threads` (`owner`,`updated`);