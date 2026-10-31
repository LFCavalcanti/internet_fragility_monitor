import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { SourceKind } from "./provider-catalog";

/** Tipo de serviço de um Provider no catálogo. */
export type ProviderType = "cloud" | "cdn" | "paas" | "saas" | "hosting";

/** Rótulo curto de um Provider Source no catálogo. */
export type SourceLabel = "feed" | "status page" | "login";

/**
 * Provider Catalog (ADR 0001): o banco é a única fonte. Muda só por migrations de dados;
 * um Provider nunca é apagado, sai do monitoramento pela marcação de inativo.
 */
export const providers = sqliteTable("providers", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    url: text("url").notNull(), // site do Provider
    statusPageUrl: text("status_page_url"), // link do card
    type: text("type").$type<ProviderType>().notNull(),
    logo: text("logo"),
    isMajor: integer("is_major", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
});

/** Provider Source: um Feed ou um Probe de um Provider. Também nunca é apagado, só desativado. */
export const providerSources = sqliteTable("provider_sources", {
    id: text("id").primaryKey(),
    providerId: text("provider_id").references(() => providers.id).notNull(),
    kind: text("kind").$type<SourceKind>().notNull(),
    family: text("family"), // família do Feed (FEED_FAMILIES em lib/provider-catalog.ts); null para Probes.
    // Texto livre de propósito: uma família desconhecida pelo código vira Feed não lido, não erro de leitura do banco.
    url: text("url").notNull(),
    label: text("label").$type<SourceLabel>().notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const incidents = sqliteTable("incidents", {
    id: text("id").primaryKey(),
    providerId: text("provider_id").references(() => providers.id).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // problem: 'investigating', 'identified', 'monitoring', 'resolved'
    // maintenance: 'scheduled', 'in_progress', 'completed'
    status: text("status").notNull(),
    kind: text("kind").notNull().default("problem"), // 'problem', 'maintenance'
    severity: text("severity"), // 'minor', 'major', 'critical'
    url: text("url"),
    scheduledFor: integer("scheduled_for", { mode: "timestamp" }), // data marcada para a manutenção começar
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

export const statusChecks = sqliteTable("status_checks", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: text("provider_id").references(() => providers.id).notNull(),
    status: text("status").notNull(), // 'operational', 'degraded', 'outage', 'unreachable' (falha de leitura)
    responseTime: integer("response_time"),
    checkedAt: integer("checked_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export type Provider = typeof providers.$inferSelect;

export type ProviderSource = typeof providerSources.$inferSelect;

export type Incident = typeof incidents.$inferSelect;
