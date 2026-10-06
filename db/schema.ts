// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const threads = sqliteTable("research_threads", {
  id: text("id").primaryKey(), owner: text("owner").notNull(),
  goal: text("goal").notNull(), state: text("state").notNull(),
  revision: integer("revision").notNull().default(0), updated: integer("updated").notNull(),
  lease: text("lease"), leaseUntil: integer("lease_until").notNull().default(0),
}, t => [index("idx_threads_owner_updated").on(t.owner, t.updated)]);
export const checkpoints = sqliteTable("research_checkpoints", {
  id: text("id").primaryKey(), threadId: text("thread_id").notNull().references(() => threads.id),
  owner: text("owner").notNull(), revision: integer("revision").notNull(),
  state: text("state").notNull(), created: integer("created").notNull(),
}, t => [index("idx_checkpoints_thread_revision").on(t.threadId, t.revision)]);
export const memories = sqliteTable("research_memories", {
  owner: text("owner").primaryKey(), text: text("text").notNull(), updated: integer("updated").notNull(),
});
export const modelBudget = sqliteTable("model_budget", {
  id: text("id").primaryKey(), calls: integer("calls").notNull().default(0),
  committedMicroUsd: integer("committed_micro_usd").notNull().default(0),
  observedMicroUsd: integer("observed_micro_usd").notNull().default(0), updated: integer("updated").notNull(),
});
