/**
 * Provider Status: o único lugar que decide o estado de um Provider num Snapshot.
 * Módulo puro: recebe as leituras e o relógio, não lê banco nem rede.
 * Termos conforme GLOSSARY.md.
 */
import type { DeclaredStatus, IncidentData, MaintenanceIncident } from "./status-feed/types";
import { closedAtMs, isClosed, isRecentlyResolved } from "./incident-status";

export type ProviderStatus =
    | "down"
    | "outage"
    | "degraded"
    | "maintenance"
    | "operational"
    | "unreachable";

/**
 * Leitura de um Feed num Poll: lida, com estado declarado e Incidents, ou não lida. O estado vem só do declarado:
 * Maintenance é declarada na leitura, e nenhum Incident muda o estado aqui.
 * Um Feed não lido pode trazer os Incidents já gravados dele: entram nos Recent Incidents,
 * mas não contam para a Upcoming Maintenance, porque nenhum Feed confirmou neste Poll que seguem valendo.
 * `answered` diz se a fonte respondeu mesmo sem poder ser lida (conteúdo fora do formato, por exemplo), o que
 * impede Down. É obrigatório: um campo esquecido não pode virar um Down falso.
 */
export type FeedReading<I extends IncidentData = IncidentData> =
    | { read: true; declared: DeclaredStatus; incidents: I[] }
    | { read: false; answered: boolean; incidents?: I[] };

export interface ProviderStatusInput {
    /**
     * Marca de "só acesso" do Provider: sem Feed no Poll gravado ou, em linha antiga ou Provider sem leitura, sem Feed
     * no catálogo (`isAccessOnly`). Com a marca, nenhuma leitura de Feed conta, só os Probes.
     */
    accessOnly: boolean;
    feeds: FeedReading[];
    /** Se cada Probe do Provider respondeu neste Poll. */
    probes: boolean[];
    /** Se no Poll anterior nenhuma fonte do Provider respondeu. */
    previousPollUnanswered: boolean;
    /** Relógio: a hora em que o Snapshot é apresentado. */
    now: Date;
}

export interface UpcomingMaintenanceSummary {
    count: number;
    /** Data marcada da próxima manutenção, ou null se nenhuma declara data. */
    next: Date | null;
}

/** Marca de Partial Reading: quantos Feeds do Provider ficaram sem leitura, entre todos. */
export interface PartialReadingMark {
    unread: number;
    total: number;
}

export interface ProviderStatusDecision {
    status: ProviderStatus;
    /** Recent Incidents em ordem de exibição: ativos primeiro, resolvidos completando até 3. */
    incidents: IncidentData[];
    upcomingMaintenance: UpcomingMaintenanceSummary | null;
    /**
     * Marca de "só acesso": o Provider não tem Feed, só Probes. O estado dele vem só da verificação de acesso
     * e nunca é Degraded, Outage ou Maintenance, que só um Feed pode declarar.
     */
    accessOnly: boolean;
    /** Partial Reading: só parte dos Feeds foi lida. Null com todos lidos, e também com nenhum lido (Unreachable). */
    partialReading: PartialReadingMark | null;
}

/** Precedência dos estados que vêm de Feeds lidos, do pior para o melhor. */
const PRECEDENCE: DeclaredStatus[] = ["outage", "degraded", "maintenance", "operational"];

/** O pior estado declarado entre os Feeds lidos. Sem nenhum, não há estado declarado. */
export function worstDeclared(declared: readonly DeclaredStatus[]): DeclaredStatus | undefined {
    return PRECEDENCE.find(s => declared.includes(s));
}

/** Tamanho da lista que os resolvidos completam; os ativos nunca são cortados. */
const RECENT_INCIDENTS_LIST_SIZE = 3;

export function decideProviderStatus(input: ProviderStatusInput): ProviderStatusDecision {
    const { accessOnly, probes, previousPollUnanswered, now } = input;
    const feeds = accessOnly ? [] : input.feeds;
    const allIncidents = feeds.flatMap(f => f.incidents ?? []);

    return {
        status: decideStatus({ accessOnly, feeds, probes, previousPollUnanswered }),
        incidents: recentIncidents(allIncidents, now),
        upcomingMaintenance: summarizeUpcoming(readIncidentsOf(feeds), now),
        accessOnly,
        partialReading: partialReadingOf(feeds),
    };
}

/** Os Incidents dos Feeds lidos: os únicos que valem como atuais neste Poll. */
export function readIncidentsOf<I extends IncidentData>(feeds: readonly FeedReading<I>[]): I[] {
    return feeds.flatMap(f => (f.read ? f.incidents : []));
}

/** Uma fonte de Feed respondeu quando foi lida ou quando respondeu com algo que não pôde ser lido. */
export function feedAnswered(feed: FeedReading): boolean {
    return feed.read || feed.answered;
}

/**
 * Havia fontes e nenhuma respondeu, nem Feeds nem Probes: a base de Down. Sem nenhuma fonte, não houve o que responder.
 */
export function sourcesUnanswered(feeds: readonly FeedReading[], probes: readonly boolean[]): boolean {
    const answers = [...feeds.map(feedAnswered), ...probes];
    return answers.length > 0 && !answers.some(Boolean);
}

function partialReadingOf(feeds: FeedReading[]): PartialReadingMark | null {
    const unread = feeds.filter(f => !f.read).length;
    return unread > 0 && unread < feeds.length ? { unread, total: feeds.length } : null;
}

/** Incident ativo exibido: problema aberto ou manutenção em andamento (a agendada é Upcoming Maintenance). */
function isActive(incident: IncidentData): boolean {
    return incident.kind === "problem" ? !isClosed(incident) : incident.status === "in_progress";
}

/**
 * Recent Incidents: todos os ativos, de qualquer idade, primeiro; os resolvidos nas últimas 48 horas
 * completam a lista até 3 itens. Cada grupo vem do mais novo para o mais antigo.
 */
function recentIncidents(incidents: IncidentData[], now: Date): IncidentData[] {
    const active = incidents
        .filter(isActive)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const resolved = incidents
        .filter(i => isRecentlyResolved(i, now))
        .sort((a, b) => closedAtMs(b) - closedAtMs(a));

    return [...active, ...resolved.slice(0, Math.max(0, RECENT_INCIDENTS_LIST_SIZE - active.length))];
}

function decideStatus({
    accessOnly,
    feeds,
    probes,
    previousPollUnanswered,
}: Omit<ProviderStatusInput, "now">): ProviderStatus {
    const declared = worstDeclared(feeds.flatMap(f => (f.read ? [f.declared] : [])));
    if (declared) return declared;

    if (probes.some(Boolean)) {
        return accessOnly ? "operational" : "unreachable";
    }
    return previousPollUnanswered && sourcesUnanswered(feeds, probes) ? "down" : "unreachable";
}

/**
 * Upcoming Maintenance: manutenção agendada para o futuro que ainda não começou.
 * Fase scheduled com data marcada até agora já começou (o Feed só atrasou a fase) e sai da conta.
 * Sem data marcada, vale a fase declarada: conta, mas não define a próxima data.
 */
function summarizeUpcoming(incidents: IncidentData[], now: Date): UpcomingMaintenanceSummary | null {
    const upcoming = incidents.filter(
        (i): i is MaintenanceIncident =>
            i.kind === "maintenance" &&
            i.status === "scheduled" &&
            (i.scheduledFor === undefined || i.scheduledFor.getTime() > now.getTime()),
    );
    if (upcoming.length === 0) return null;

    const dates = upcoming.flatMap(i => (i.scheduledFor ? [i.scheduledFor.getTime()] : []));

    return {
        count: upcoming.length,
        next: dates.length > 0 ? new Date(Math.min(...dates)) : null,
    };
}
