import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { SourceKind } from "./provider-catalog";
import type { DeclaredStatus } from "./status-feed/types";

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

/**
 * Um Incident é identificado pelo par Feed e id publicado por ele. As linhas gravadas antes dessa identidade não têm
 * nenhum dos dois: anuláveis, várias convivem, porque o SQLite não compara NULL num índice único.
 */
export const incidents = sqliteTable("incidents", {
    id: text("id").primaryKey(),
    providerId: text("provider_id").references(() => providers.id).notNull(),
    sourceId: text("source_id").references(() => providerSources.id),
    externalId: text("external_id"),
    title: text("title").notNull(),
    description: text("description"),
    // problem: 'investigating', 'identified', 'monitoring', 'resolved'
    // maintenance: 'scheduled', 'in_progress', 'completed'
    status: text("status").notNull(),
    kind: text("kind").notNull().default("problem"), // 'problem', 'maintenance'
    url: text("url"),
    scheduledFor: integer("scheduled_for", { mode: "timestamp" }), // data marcada para a manutenção começar
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
}, table => [uniqueIndex("incidents_source_external_unique").on(table.sourceId, table.externalId)]);

/** Um Feed lido num Poll: a Provider Source e o que ela declarou, ou `null` se ficou sem leitura. */
export interface RecordedFeed {
    sourceId: string;
    declared: DeclaredStatus | null;
}

/**
 * Uma leitura por Provider em cada Poll. As linhas gravadas antes dela são uma por Feed, sem `feeds`, e não dizem se
 * a fonte respondeu: Probes de um Provider com Feed nem eram gravados. Por isso o padrão de `no_source_answered` é
 * falso, e uma linha antiga nunca conta para Down.
 */
export const statusChecks = sqliteTable("status_checks", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    providerId: text("provider_id").references(() => providers.id).notNull(),
    // Pior estado entre os Feeds lidos ('operational', 'degraded', 'outage') ou 'unreachable' sem Feed lido.
    // Provider só com Probes: 'operational' com algum Probe de pé. Down não é gravado: depende do Poll anterior.
    status: text("status").notNull(),
    checkedAt: integer("checked_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
    noSourceAnswered: integer("no_source_answered", { mode: "boolean" }).notNull().default(false), // nem Feeds, nem Probes
    // Os Feeds ativos no Poll, na ordem do catálogo. Lista vazia: o Provider foi lido só por Probes.
    feeds: text("feeds", { mode: "json" }).$type<RecordedFeed[]>(),
}, table => [index("status_checks_provider_checked_at").on(table.providerId, table.checkedAt)]);

export type Provider = typeof providers.$inferSelect;

export type ProviderSource = typeof providerSources.$inferSelect;

export type Incident = typeof incidents.$inferSelect;
