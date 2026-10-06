CREATE TABLE `model_budget` (
	`id` text PRIMARY KEY NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`committed_micro_usd` integer DEFAULT 0 NOT NULL,
	`observed_micro_usd` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL
);
