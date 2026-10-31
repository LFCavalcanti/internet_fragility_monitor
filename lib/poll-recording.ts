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
import type { IncidentData, MaintenancePhase, ProblemStatus, ReadIncident, ReadingStatus } from "./status-feed/types";

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

/** A identidade de um Incident como chave de índice em memória: a Provider Source e o id publicado por ela. */
function identityOf({ sourceId, externalId }: Pick<Incident, "sourceId" | "externalId">): string {
    return `${sourceId}\0${externalId}`;
}

/** Linha gravada antes da identidade: sem fonte e sem id. A passagem única dá fim a todas as abertas. */
const isOldRow = (row: Incident) => row.sourceId === null;

/** A hora de encerramento de um Incident publicado. De volta a uma fase aberta, ela sai. */
function resolvedAtOf(incident: ReadIncident, row: Incident | undefined, at: Date): Date | null {
    if (!isClosed(incident)) return null;
    if (incident.resolvedAt) return incident.resolvedAt;
    // Sem hora publicada, a hora do Poll vale só para quem encerra agora. Quem já chegou encerrado, sem hora nenhuma,
    // fica assim: a janela de Recent Incident conta da criação, e o Incident não parece recém-resolvido.
    if (!row) return null;
    return isClosed(toIncidentData(row)) ? row.resolvedAt : at;
}

/** O que a gravação guarda do que o Feed publica. O id é a identidade; título e link são só a publicação de agora. */
function publishedFields(incident: ReadIncident, row: Incident | undefined, at: Date) {
    return {
        sourceId: incident.sourceId,
        externalId: incident.externalId,
        title: incident.title,
        description: incident.description || row?.description,
        status: incident.status,
        kind: incident.kind,
        scheduledFor: scheduledForOf(incident),
        url: incident.url || row?.url,
        createdAt: incident.createdAt,
        resolvedAt: resolvedAtOf(incident, row, at),
    };
}

/** Valor como a coluna guarda: as colunas de data têm precisão de segundos, e uma data do Feed pode ter milissegundos. */
const stored = (value: string | Date | null | undefined) =>
    value instanceof Date ? Math.floor(value.getTime() / 1000) : value ?? null;

type PublishedFields = ReturnType<typeof publishedFields>;

function differs(row: Incident, fields: PublishedFields): boolean {
    return (Object.keys(fields) as (keyof PublishedFields)[]).some(column => stored(row[column]) !== stored(fields[column]));
}

/**
 * Reconcilia os Incidents de um Provider com os Feeds lidos neste Poll. O par Provider Source e id publicado identifica
 * o Incident: novo é inserido, conhecido é atualizado, inclusive quando volta a abrir depois de encerrado, e o ativo
 * que saiu de um Feed lido é encerrado. Os de um Feed não lido ficam como estão.
 *
 * Passagem única: o Incident sem linha com o seu par assume uma linha antiga aberta com o mesmo título. As que ninguém
 * assumir são encerradas no primeiro Poll com todos os Feeds lidos, porque sob Partial Reading podem ser do Feed não
 * lido. Encerradas, ficam como histórico e nada mais as procura: o título só vale enquanto restar linha antiga aberta.
 *
 * O histórico do Provider é consultado uma vez, qualquer que seja o volume do Feed.
 */
async function reconcileIncidents(tx: Writer, { providerId, feeds }: ProviderReading<ReadIncident>, at: Date) {
    // Uma falha de leitura não diz nada sobre os Incidents: os gravados ficam como estão e o card continua a mostrá-los.
    // Probes também não declaram Incidents.
    const readSources = new Set(feeds.filter(f => f.read).map(f => f.sourceId));
    if (readSources.size === 0) return;

    // Um par repetido no Feed vira uma linha só, e a unicidade do par não recusa o Poll.
    const published = new Map(readIncidentsOf(feeds).map(incident => [identityOf(incident), incident]));
    const recorded = await tx.select().from(incidents)
        .where(eq(incidents.providerId, providerId))
        .orderBy(desc(incidents.createdAt));

    const known = new Map<string, Incident>();
    const openOldRowsByTitle = new Map<string, Incident[]>();
    for (const row of recorded) {
        if (!isOldRow(row)) {
            known.set(identityOf(row), row);
        } else if (!isClosed(toIncidentData(row))) {
            const title = row.title.trim();
            if (!openOldRowsByTitle.has(title)) openOldRowsByTitle.set(title, []);
            openOldRowsByTitle.get(title)?.push(row);
        }
    }

    for (const [identity, incident] of published) {
        const row = known.get(identity) ?? openOldRowsByTitle.get(incident.title.trim())?.shift();
        const fields = publishedFields(incident, row, at);
        if (!row) {
            await tx.insert(incidents).values({ id: crypto.randomUUID(), providerId, ...fields, updatedAt: at });
        } else if (differs(row, fields)) {
            await tx.update(incidents).set({ ...fields, updatedAt: at }).where(eq(incidents.id, row.id));
        }
    }

    const leftTheFeed = recorded.filter(row =>
        row.sourceId !== null &&
        readSources.has(row.sourceId) &&
        !published.has(identityOf(row)) &&
        !isClosed(toIncidentData(row)),
    );
    const unclaimed = readSources.size === feeds.length ? [...openOldRowsByTitle.values()].flat() : [];

    for (const row of [...leftTheFeed, ...unclaimed]) {
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
export async function recordPoll(db: Database, readings: readonly ProviderReading<ReadIncident>[], at: Date = new Date()): Promise<void> {
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
 * Provider com Feed: cada Feed vai lido, com o estado declarado, ou não lido, levando os seus Incidents: os de um Feed
 * não lido entram na lista, mas não decidem o estado nem a Upcoming Maintenance.
 * A n-ésima linha do Poll é o n-ésimo Feed ativo, porque o Poll grava os Feeds na ordem do catálogo. Sem Feed certo
 * (linha antiga, Feed desativado, ou catálogo mudado depois do Poll), o Incident vai no primeiro Feed não lido, onde
 * não decide nada, ou no primeiro Feed se todos foram lidos.
 * Provider só com Probes: nenhum Feed, e a leitura gravada diz só se algum Probe respondeu. Um estado declarado
 * gravado antes (de quando havia Feed) não conta: só um Feed declara Degraded, Outage ou Maintenance.
 * O Poll anterior sem resposta, que habilita Down, chega com o Ticket 15.
 */
function toStatusInput(
    accessOnly: boolean,
    recorded: ReadingStatus[],
    feedIds: string[],
    incidentRows: Incident[],
): SnapshotEntry["reading"] {
    const base = { previousPollUnanswered: false };
    if (accessOnly) {
        return { ...base, accessOnly, feeds: [], probes: recorded.map(r => r !== "unreachable") };
    }

    const linesMatchFeeds = recorded.length === feedIds.length;
    const withoutFeed = Math.max(0, recorded.indexOf("unreachable"));
    const incidentsByLine = recorded.map((): IncidentData[] => []);
    for (const row of incidentRows) {
        const line = linesMatchFeeds && row.sourceId ? feedIds.indexOf(row.sourceId) : -1;
        incidentsByLine[line >= 0 ? line : withoutFeed].push(toIncidentData(row));
    }

    return {
        ...base,
        accessOnly,
        feeds: recorded.map((status, line) =>
            status === "unreachable"
                ? { read: false, incidents: incidentsByLine[line] }
                : { read: true, declared: status, incidents: incidentsByLine[line] },
        ),
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
        const sourcesOfProvider = sources.get(provider.id) ?? [];
        const incidentRows = (recorded.get(provider.id) ?? []).filter(row => {
            const incident = toIncidentData(row);
            return !isClosed(incident) || isRecentlyResolved(incident, now);
        });

        return {
            provider: toSnapshotProvider(provider),
            reading: toStatusInput(
                isAccessOnly(sourcesOfProvider),
                latest.length > 0 ? latest.map(c => c.status as ReadingStatus) : ["operational"],
                sourcesOfProvider.filter(s => s.kind === "feed").map(s => s.id),
                incidentRows,
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
