/**
 * Poll Recording: o único lugar que grava um Poll e lê o Snapshot. O banco é recebido, nunca aberto aqui.
 * Quem chama entrega as leituras do Poll e recebe, por Provider, a entrada do módulo de Provider Status: como a
 * leitura mora nas tabelas não sai deste módulo.
 * Termos conforme GLOSSARY.md.
 */
import { and, asc, desc, eq, gte, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import { alias, type SQLiteColumn } from "drizzle-orm/sqlite-core";
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
import { groupByProvider } from "./provider-catalog";
import { readIncidentsOf, sourcesUnanswered, worstDeclared, type ProviderStatusInput } from "./provider-status";
import { incidents, providers, providerSources, statusChecks } from "./schema";
import type { Incident, Provider, ProviderSource, RecordedFeed } from "./schema";
import type { ProviderReading } from "./status-feed/provider-reading";
import type {
    IncidentData,
    MaintenancePhase,
    ProblemStatus,
    ReadIncident,
    ReadingStatus,
} from "./status-feed/types";

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

/** A transação de um Poll, que a reconciliação e a retenção recebem para consultar e gravar. */
type Writer = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Uma leitura com mais de 90 dias é apagada; a de exatamente 90 dias fica, e as duas mais novas de cada Provider também. */
const READING_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Os ids das duas leituras mais novas de um Provider: o último Poll gravado e o anterior. Dois Polls no mesmo segundo
 * contam como dois. É uma subconsulta presa à linha de fora, que dá o Provider em `providerId`.
 */
function twoNewestOf(db: Database | Writer, providerId: SQLiteColumn) {
    const recent = alias(statusChecks, "recent");
    return db.select({ id: recent.id }).from(recent)
        .where(eq(recent.providerId, providerId))
        .orderBy(desc(recent.checkedAt), desc(recent.id))
        .limit(2);
}

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
    readings: z.array(z.enum(["operational", "maintenance", "degraded", "outage", "unreachable"] satisfies ReadingStatus[])),
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
        readings: reading.feeds.map(f => (f.read ? f.declared : "unreachable")),
        incidents: readIncidentsOf(reading.feeds),
    });
    if (!checked.success) {
        throw new Error(`Leitura de ${reading.providerId} recusada: ${z.prettifyError(checked.error)}`);
    }
}

/**
 * A linha que um Poll grava de um Provider em `status_checks`. O pior estado lido basta para o vence-o-pior da leitura;
 * sem Feed lido, a leitura é "unreachable". `feeds` guarda o resto, quais Feeds foram lidos neste Poll e o que cada um
 * declarou, e diz como a leitura foi feita: lista vazia, por Probes.
 */
function toRecordedReading({ feeds, probes }: ProviderReading) {
    const recordedFeeds = feeds.map((f): RecordedFeed => ({ sourceId: f.sourceId, declared: f.read ? f.declared : null }));
    const declared = recordedFeeds.flatMap(f => f.declared ?? []);
    const readByProbes = feeds.length === 0 && probes.some(Boolean);

    return {
        status: readByProbes ? "operational" : worstDeclared(declared) ?? "unreachable",
        noSourceAnswered: sourcesUnanswered(feeds, probes),
        feeds: recordedFeeds,
    };
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
        console.log(`Closing incident: ${row.title} for ${providerId}`);
        await tx.update(incidents).set({
            status: closedStatusFor(row.kind === "maintenance" ? "maintenance" : "problem"),
            updatedAt: at,
            resolvedAt: at,
        }).where(eq(incidents.id, row.id));
    }
}

/**
 * Apaga as leituras com mais de 90 dias, contados de `at`, de todos os Providers, ativos ou não. Incidents nunca saem.
 * As duas leituras mais novas de cada Provider ficam, qualquer que seja a idade: são o último Poll e o anterior, que a
 * regra de Down compara sem olhar a hora, e um intervalo longo sem Polls não pode mudar essa decisão.
 * A lista de Providers faz o `DELETE` usar o índice por Provider e hora, em vez de varrer `status_checks` a cada Poll.
 */
async function deleteExpiredReadings(tx: Writer, at: Date) {
    const kept = alias(statusChecks, "kept");
    const newestOfEachProvider = tx.select({ id: kept.id }).from(providers).crossJoin(kept)
        .where(inArray(kept.id, twoNewestOf(tx, providers.id)));

    await tx.delete(statusChecks).where(and(
        inArray(statusChecks.providerId, tx.select({ id: providers.id }).from(providers)),
        lt(statusChecks.checkedAt, new Date(at.getTime() - READING_RETENTION_MS)),
        notInArray(statusChecks.id, newestOfEachProvider),
    ));
}

/**
 * Grava um Poll numa transação: as leituras de todos os Providers, com a mesma hora, que é o que as liga a este Poll,
 * a reconciliação dos Incidents e a retenção das leituras. Qualquer erro rejeita a promessa e não deixa nada gravado.
 */
export async function recordPoll(db: Database, readings: readonly ProviderReading<ReadIncident>[], at: Date = new Date()): Promise<void> {
    readings.forEach(assertRecordable);

    const checks = readings.map(reading => ({ providerId: reading.providerId, ...toRecordedReading(reading), checkedAt: at }));

    await db.transaction(async tx => {
        if (checks.length > 0) await tx.insert(statusChecks).values(checks);
        for (const reading of readings) await reconcileIncidents(tx, reading, at);
        await deleteExpiredReadings(tx, at);
    });
}

// ============================================================================
// Ler o Snapshot
// ============================================================================

/**
 * As duas leituras mais novas de cada Provider ativo, numa consulta só, da mais nova para a mais antiga: o último Poll
 * gravado e o anterior. Um Poll descartado não grava nada, então não conta nem zera: os Polls vizinhos são seguidos.
 * O custo depende do número de Providers, não do tamanho do histórico, por duas peças: o índice por Provider e hora, e
 * o CROSS JOIN, que no SQLite fixa `providers` por fora. Com um JOIN comum, o planejador varre `status_checks` inteira.
 * Exportada só para o teste conferir esse plano; a leitura de fora continua sendo `readSnapshot`.
 */
export function latestChecks(db: Database) {
    return db
        .select({
            providerId: statusChecks.providerId,
            status: statusChecks.status,
            noSourceAnswered: statusChecks.noSourceAnswered,
            feeds: statusChecks.feeds,
            checkedAt: statusChecks.checkedAt,
        })
        .from(providers)
        .crossJoin(statusChecks)
        .where(and(eq(providers.active, true), inArray(statusChecks.id, twoNewestOf(db, providers.id))))
        .orderBy(desc(statusChecks.checkedAt), desc(statusChecks.id));
}

type RecordedCheck = Awaited<ReturnType<typeof latestChecks>>[number];

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
 * Os Feeds do último Poll: os que ele gravou, porque a leitura vale pelo que foi lido, mesmo que o catálogo mude antes
 * do Poll seguinte. A linha antiga não os guarda, e o Provider sem leitura gravada vem Operational: valem os Feeds
 * ativos do catálogo, todos com o estado da linha.
 */
function recordedFeedsOf(latest: RecordedCheck | undefined, catalogFeedIds: string[]): RecordedFeed[] {
    if (latest?.feeds) return latest.feeds;
    const status = (latest?.status ?? "operational") as ReadingStatus;
    return catalogFeedIds.map(sourceId => ({ sourceId, declared: status === "unreachable" ? null : status }));
}

/**
 * O que a leitura gravada diz dos Probes de um Provider só com Probes. Um estado declarado gravado antes (de quando
 * havia Feed) conta só como "algum Probe respondeu": só um Feed declara Degraded, Outage ou Maintenance.
 * Sem resposta de fato, a linha diz; "unreachable" sem a indicação é linha antiga ou Provider sem fontes, e não conta.
 */
function recordedProbes(latest: RecordedCheck | undefined): boolean[] {
    if (latest?.noSourceAnswered) return [false];
    return latest?.status === "unreachable" ? [] : [true];
}

/**
 * Remonta a entrada do módulo de Provider Status a partir das duas últimas leituras gravadas.
 * Provider com Feed: cada Feed vai lido, com o estado da gravação, ou não lido, levando os seus Incidents: os de um
 * Feed não lido entram na lista, mas não contam para a Upcoming Maintenance. Sem Feed certo (linha antiga, Feed fora
 * do Poll), o Incident vai no primeiro Feed não lido, onde só entra na lista, ou no primeiro Feed se todos foram lidos.
 * A linha guarda a resposta por Provider, não por fonte: os Probes de um Provider com Feed não voltam, e a resposta
 * deles vale como a do Feed não lido, o que dá a mesma decisão.
 */
function toStatusInput(
    latest: RecordedCheck | undefined,
    previous: RecordedCheck | undefined,
    catalogFeedIds: string[],
    incidentRows: Incident[],
): SnapshotEntry["reading"] {
    const feeds = recordedFeedsOf(latest, catalogFeedIds);
    const previousPollUnanswered = previous?.noSourceAnswered ?? false;

    if (feeds.length === 0) {
        return { accessOnly: true, feeds: [], probes: recordedProbes(latest), previousPollUnanswered };
    }

    const feedIds = feeds.map(f => f.sourceId);
    const withoutFeed = Math.max(0, feeds.findIndex(f => f.declared === null));
    const incidentsByFeed = feeds.map((): IncidentData[] => []);
    for (const row of incidentRows) {
        const feed = row.sourceId ? feedIds.indexOf(row.sourceId) : -1;
        incidentsByFeed[feed >= 0 ? feed : withoutFeed].push(toIncidentData(row));
    }

    return {
        accessOnly: false,
        feeds: feeds.map(({ declared }, i) =>
            declared === null
                ? { read: false, answered: !latest?.noSourceAnswered, incidents: incidentsByFeed[i] }
                : { read: true, declared, incidents: incidentsByFeed[i] },
        ),
        probes: [],
        previousPollUnanswered,
    };
}

/**
 * Lê o Snapshot guiado pelo Provider Catalog: os Providers ativos, na ordem de exibição, cada um com a leitura do
 * último Poll, a indicação de que o Poll anterior ficou sem resposta e os Incidents que o módulo de Provider Status
 * pode exibir ou contar: todos os abertos, sem corte por quantidade, e os problemas resolvidos dentro da janela de
 * Recent Incident. Manutenção completed nunca vem. Provider sem leitura gravada vem Operational.
 * `now` é o mesmo relógio que a página passa ao módulo.
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
        const [latest, previous] = checks.get(provider.id) ?? [];
        const sourcesOfProvider = sources.get(provider.id) ?? [];
        const incidentRows = (recorded.get(provider.id) ?? []).filter(row => {
            const incident = toIncidentData(row);
            return !isClosed(incident) || isRecentlyResolved(incident, now);
        });

        return {
            provider: toSnapshotProvider(provider),
            reading: toStatusInput(
                latest,
                previous,
                sourcesOfProvider.filter(s => s.kind === "feed").map(s => s.id),
                incidentRows,
            ),
            lastUpdated: latest?.checkedAt ?? undefined,
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
