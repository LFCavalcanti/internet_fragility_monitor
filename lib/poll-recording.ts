/**
 * Poll Recording: o único lugar que grava um Poll e lê o Snapshot. O banco é recebido, nunca aberto aqui.
 * Quem chama entrega as leituras do Poll e recebe, por Provider, a entrada do módulo de Provider Status: como a
 * leitura mora nas tabelas não sai deste módulo.
 * Termos conforme GLOSSARY.md.
 */
import { and, asc, desc, eq, gte, max, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db";
import {
    CLOSED_STATUSES,
    INCIDENT_DESCRIPTION_MAX,
    INCIDENT_TITLE_MAX,
    RECENT_INCIDENT_WINDOW_MS,
    closedStatusFor,
    isClosed,
    isRecentlyResolved,
} from "./incident-status";
import { groupByProvider, isAccessOnly } from "./provider-catalog";
import { readIncidentsOf, type ProviderStatusInput } from "./provider-status";
import { incidents, providers, providerSources, statusChecks } from "./schema";
import type { Incident, Provider, ProviderSource } from "./schema";
import type { ProviderReading } from "./status-feed/provider-reading";
import type { IncidentData, MaintenancePhase, ProblemStatus, ReadingStatus } from "./status-feed/types";

/** O que um Poll lê: os Providers ativos do Provider Catalog e os Provider Sources ativos deles. */
export interface ActiveCatalog {
    providers: Provider[];
    sources: ProviderSource[];
}

/** Um Provider ativo do Provider Catalog, com os dados que a página e o Internet Health usam. */
export interface SnapshotProvider {
    id: string;
    name: string;
    logo?: string;
    /** Link da status page no card. */
    statusPageUrl?: string;
    /** Marcado no catálogo como Major Provider. */
    isMajor: boolean;
}

/** Um Provider ativo no Snapshot: os dados do catálogo e a entrada do módulo de Provider Status, à espera do relógio. */
export interface SnapshotEntry {
    provider: SnapshotProvider;
    reading: Omit<ProviderStatusInput, "now">;
    /** Hora do último Poll que gravou o Provider. */
    lastUpdated?: Date;
}

export interface Snapshot {
    /** Os Providers ativos, na ordem de exibição. */
    providers: SnapshotEntry[];
    /** Hora do último Poll gravado; `null` quando nenhum Poll foi gravado. */
    lastPollAt: Date | null;
}

/** A transação de um Poll, que a reconciliação recebe para consultar e gravar. */
type Writer = Parameters<Parameters<Database["transaction"]>[0]>[0];

// ============================================================================
// O Provider Catalog só é lido aqui: ele muda por migrations de dados (ADR 0001), nunca pelo código.
// ============================================================================

const activeProviders = (db: Database) =>
    db.select().from(providers).where(eq(providers.active, true)).orderBy(asc(providers.displayOrder), asc(providers.id));

/** Fonte inativa ou de Provider inativo nunca vem. */
const activeSources = (db: Database) =>
    db.select({ source: providerSources }).from(providerSources)
        .innerJoin(providers, eq(providers.id, providerSources.providerId))
        .where(and(eq(providers.active, true), eq(providerSources.active, true)))
        .orderBy(asc(providerSources.providerId), asc(providerSources.id));

export async function readActiveCatalog(db: Database): Promise<ActiveCatalog> {
    const [providerRows, sourceRows] = await db.batch([activeProviders(db), activeSources(db)]);
    return { providers: providerRows, sources: sourceRows.map(r => r.source) };
}

// ============================================================================
// Gravar um Poll
// ============================================================================

const incidentText = {
    title: z.string().trim().min(1).max(INCIDENT_TITLE_MAX),
    description: z.string().max(INCIDENT_DESCRIPTION_MAX).optional(),
};

const recordableReading = z.object({
    readings: z.array(z.enum(["operational", "degraded", "outage", "unreachable"] satisfies ReadingStatus[])),
    incidents: z.array(
        z.discriminatedUnion("kind", [
            z.object({
                ...incidentText,
                kind: z.literal("problem"),
                status: z.enum(["investigating", "identified", "monitoring", "resolved"] satisfies ProblemStatus[]),
            }),
            z.object({
                ...incidentText,
                kind: z.literal("maintenance"),
                status: z.enum(["scheduled", "in_progress", "completed"] satisfies MaintenancePhase[]),
            }),
        ]),
    ),
});

/** Um valor fora do vocabulário do domínio não chega ao banco: o Poll inteiro é recusado. */
function assertRecordable(reading: ProviderReading) {
    const checked = recordableReading.safeParse({
        readings: toRecordedReadings(reading),
        incidents: readIncidentsOf(reading.feeds),
    });
    if (!checked.success) {
        throw new Error(`Leitura de ${reading.providerId} recusada: ${z.prettifyError(checked.error)}`);
    }
}

/**
 * O que um Poll grava de um Provider em `status_checks`: uma linha por Feed, com o estado declarado ou "unreachable",
 * o que preserva a Partial Reading sem coluna nova. Provider só com Probes: uma linha só, Operational quando algum
 * Probe respondeu. Os Probes de um Provider com Feed não são gravados: até o Ticket 15 eles não mudam nada, porque
 * Unreachable vale com ou sem resposta deles.
 */
function toRecordedReadings({ accessOnly, feeds, probes }: ProviderReading): ReadingStatus[] {
    if (accessOnly) return [probes.some(Boolean) ? "operational" : "unreachable"];
    return feeds.map(f => (f.read ? f.declared : "unreachable"));
}

function scheduledForOf(incident: IncidentData): Date | null {
    return incident.kind === "maintenance" ? incident.scheduledFor ?? null : null;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
    return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

/**
 * Reconcilia os Incidents de um Provider com os Feeds lidos, pelo título, até a identidade pela fonte do Ticket 14.
 * O histórico do Provider é consultado uma vez, qualquer que seja o volume do Feed.
 */
async function reconcileIncidents(tx: Writer, { providerId, feeds }: ProviderReading, at: Date) {
    // Uma falha de leitura não diz nada sobre os Incidents: os gravados ficam como estão e o card continua a mostrá-los.
    // Probes também não declaram Incidents.
    const readFeeds = feeds.filter(f => f.read).length;
    if (readFeeds === 0) return;

    const published = readIncidentsOf(feeds);
    const recorded = await tx.select().from(incidents)
        .where(eq(incidents.providerId, providerId))
        .orderBy(desc(incidents.createdAt));

    // O mais novo vence quando o título se repete no histórico.
    const newestByTitle = new Map<string, Incident>();
    for (const row of recorded) {
        if (!newestByTitle.has(row.title)) newestByTitle.set(row.title, row);
    }

    for (const incident of published) {
        const known = newestByTitle.get(incident.title);
        const scheduledFor = scheduledForOf(incident);
        if (!known) {
            await tx.insert(incidents).values({
                id: crypto.randomUUID(),
                providerId,
                title: incident.title,
                description: incident.description,
                status: incident.status,
                kind: incident.kind,
                scheduledFor,
                url: incident.url,
                createdAt: incident.createdAt,
                updatedAt: at,
                // Já encerrado no Feed: a hora de resolução publicada, para a janela de Recent Incident.
                resolvedAt: isClosed(incident) ? incident.resolvedAt ?? null : null,
            });
        } else if (
            known.status !== incident.status ||
            known.kind !== incident.kind ||
            !sameInstant(known.scheduledFor, scheduledFor)
        ) {
            await tx.update(incidents).set({
                status: incident.status,
                description: incident.description || known.description || undefined,
                kind: incident.kind,
                scheduledFor,
                updatedAt: at,
                // De volta a uma fase aberta, a hora do encerramento sai.
                resolvedAt: isClosed(incident) ? at : null,
            }).where(eq(incidents.id, known.id));
        }
    }

    // Partial Reading: um Incident gravado pode ser do Feed não lido, e a linha só diz de qual Feed veio a partir do
    // Ticket 14. Um Feed não lido nunca encerra os seus Incidents, então nada é encerrado neste Poll.
    if (readFeeds < feeds.length) return;

    const stillPublished = new Set(published.map(i => i.title));
    for (const row of recorded) {
        if (stillPublished.has(row.title) || isClosed(toIncidentData(row))) continue;
        console.log(`Closing incident that left the Feed: ${row.title} for ${providerId}`);
        await tx.update(incidents).set({
            status: closedStatusFor(row.kind === "maintenance" ? "maintenance" : "problem"),
            updatedAt: at,
            resolvedAt: at,
        }).where(eq(incidents.id, row.id));
    }
}

/**
 * Grava um Poll numa transação: as leituras de todos os Providers, com a mesma hora, que é o que as liga a este Poll,
 * e a reconciliação dos Incidents. Qualquer erro rejeita a promessa e não deixa nada gravado.
 */
export async function recordPoll(db: Database, readings: readonly ProviderReading[], at: Date = new Date()): Promise<void> {
    readings.forEach(assertRecordable);

    const checks = readings.flatMap(reading =>
        toRecordedReadings(reading).map(status => ({ providerId: reading.providerId, status, checkedAt: at })),
    );

    await db.transaction(async tx => {
        if (checks.length > 0) await tx.insert(statusChecks).values(checks);
        for (const reading of readings) await reconcileIncidents(tx, reading, at);
    });
}

// ============================================================================
// Ler o Snapshot
// ============================================================================

/** As linhas do último Poll de cada Provider: uma por Feed, todas com a mesma hora, na ordem de gravação. */
function latestChecks(db: Database) {
    const latest = db
        .select({ providerId: statusChecks.providerId, checkedAt: max(statusChecks.checkedAt).as("latest_checked_at") })
        .from(statusChecks)
        .groupBy(statusChecks.providerId)
        .as("latest");

    return db
        .select({ providerId: statusChecks.providerId, status: statusChecks.status, checkedAt: statusChecks.checkedAt })
        .from(statusChecks)
        .innerJoin(latest, and(eq(statusChecks.providerId, latest.providerId), eq(statusChecks.checkedAt, latest.checkedAt)))
        .orderBy(asc(statusChecks.id));
}

/**
 * Os Incidents que podem entrar no Snapshot, do mais novo para o mais antigo: todos os abertos e os encerrados dentro
 * da janela de Recent Incident. A regra exata é a de `isRecentlyResolved`; aqui só se evita ler o histórico inteiro.
 */
function snapshotIncidents(db: Database, now: Date) {
    const cutoffSeconds = Math.floor((now.getTime() - RECENT_INCIDENT_WINDOW_MS) / 1000);
    return db.select().from(incidents)
        .where(or(
            notInArray(incidents.status, [...CLOSED_STATUSES]),
            gte(sql`coalesce(${incidents.resolvedAt}, ${incidents.createdAt})`, cutoffSeconds),
        ))
        .orderBy(desc(incidents.createdAt));
}

/** Borda do Snapshot: os campos anuláveis do catálogo viram opcionais uma vez, aqui. */
function toSnapshotProvider(row: Provider): SnapshotProvider {
    return {
        id: row.id,
        name: row.name,
        logo: row.logo ?? undefined,
        statusPageUrl: row.statusPageUrl ?? undefined,
        isMajor: row.isMajor,
    };
}

function toIncidentData(row: Incident): IncidentData {
    const base = {
        title: row.title,
        description: row.description || undefined,
        url: row.url || undefined,
        createdAt: row.createdAt || new Date(),
        updatedAt: row.updatedAt || undefined,
        resolvedAt: row.resolvedAt || undefined,
    };
    if (row.kind === "maintenance") {
        return {
            ...base,
            kind: "maintenance",
            status: row.status as MaintenancePhase,
            scheduledFor: row.scheduledFor || undefined,
        };
    }
    return { ...base, kind: "problem", status: row.status as ProblemStatus };
}

/**
 * Remonta a entrada do módulo de Provider Status a partir das linhas do último Poll.
 * Provider com Feed: cada Feed vai lido, com o estado declarado, ou não lido. Os Incidents gravados ainda não dizem
 * de qual Feed vieram (Ticket 14), então vão juntos no primeiro Feed lido, ou no primeiro Feed se nenhum foi lido.
 * Provider só com Probes: nenhum Feed, e a leitura gravada diz só se algum Probe respondeu. Um estado declarado
 * gravado antes (de quando havia Feed) não conta: só um Feed declara Degraded, Outage ou Maintenance.
 * O Poll anterior sem resposta, que habilita Down, chega com o Ticket 15.
 */
function toStatusInput(accessOnly: boolean, recorded: ReadingStatus[], incidentsOfProvider: IncidentData[]): SnapshotEntry["reading"] {
    const base = { previousPollUnanswered: false };
    if (accessOnly) {
        return { ...base, accessOnly, feeds: [], probes: recorded.map(r => r !== "unreachable") };
    }

    const incidentsAt = Math.max(0, recorded.findIndex(r => r !== "unreachable"));
    return {
        ...base,
        accessOnly,
        feeds: recorded.map((status, index) => {
            const feedIncidents = index === incidentsAt ? incidentsOfProvider : [];
            return status === "unreachable"
                ? { read: false, incidents: feedIncidents }
                : { read: true, declared: status, incidents: feedIncidents };
        }),
        probes: [],
    };
}

/**
 * Lê o Snapshot guiado pelo Provider Catalog: os Providers ativos, na ordem de exibição, cada um com a leitura do
 * último Poll e os Incidents que o módulo de Provider Status pode exibir ou contar: todos os abertos, sem corte por
 * quantidade, e os problemas resolvidos dentro da janela de Recent Incident. Manutenção completed nunca vem.
 * Provider sem leitura gravada vem Operational. `now` é o mesmo relógio que a página passa ao módulo.
 *
 * Um número fixo de consultas, num `batch`: a leitura inteira vê um só instante do banco, nunca a metade de um Poll.
 */
export async function readSnapshot(db: Database, now: Date): Promise<Snapshot> {
    const [providerRows, sourceRows, checkRows, incidentRows] = await db.batch([
        activeProviders(db),
        activeSources(db),
        latestChecks(db),
        snapshotIncidents(db, now),
    ]);

    const sources = groupByProvider(sourceRows.map(r => r.source));
    const checks = groupByProvider(checkRows);
    const recorded = groupByProvider(incidentRows);

    const entries = providerRows.map((provider): SnapshotEntry => {
        const latest = checks.get(provider.id) ?? [];
        const incidentsOfProvider = (recorded.get(provider.id) ?? [])
            .map(toIncidentData)
            .filter(i => !isClosed(i) || isRecentlyResolved(i, now));

        return {
            provider: toSnapshotProvider(provider),
            reading: toStatusInput(
                isAccessOnly(sources.get(provider.id) ?? []),
                latest.length > 0 ? latest.map(c => c.status as ReadingStatus) : ["operational"],
                incidentsOfProvider,
            ),
            lastUpdated: latest[0]?.checkedAt ?? undefined,
        };
    });

    return { providers: entries, lastPollAt: latestPollAt(entries) };
}

/** Todo Poll gravado grava todos os Providers ativos, então a leitura mais nova é a hora do último Poll. */
function latestPollAt(entries: SnapshotEntry[]): Date | null {
    return entries.reduce<Date | null>(
        (latest, { lastUpdated }) => (lastUpdated && (!latest || lastUpdated > latest) ? lastUpdated : latest),
        null,
    );
}
