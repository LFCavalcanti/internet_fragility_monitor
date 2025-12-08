import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const providers = sqliteTable("providers", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    type: text("type").notNull(), // 'cloud', 'cdn', 'paas'
    logo: text("logo"),
});

export const incidents = sqliteTable("incidents", {
    id: text("id").primaryKey(),
    providerId: text("provider_id").references(() => providers.id).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull(), // 'investigating', 'identified', 'monitoring', 'resolved'
    severity: text("severity"), // 'minor', 'major', 'critical'
    url: text("url"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

export const statusChecks = sqliteTable("status_checks", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: text("provider_id").references(() => providers.id).notNull(),
    status: text("status").notNull(), // 'operational', 'degraded', 'outage'
    responseTime: integer("response_time"),
    checkedAt: integer("checked_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;

export type StatusCheck = typeof statusChecks.$inferSelect;
export type NewStatusCheck = typeof statusChecks.$inferInsert;
