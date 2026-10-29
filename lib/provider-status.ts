/**
 * Provider Status: o único lugar que decide o estado de um Provider num Snapshot.
 * Módulo puro: recebe as leituras e o relógio, não lê banco nem rede.
 * Termos conforme GLOSSARY.md.
 */
import type { DeclaredStatus, IncidentData, MaintenanceIncident } from "./fetchers/types";
import { isClosed } from "./incident-status";

export type ProviderStatus =
    | "down"
    | "outage"
    | "degraded"
    | "maintenance"
    | "operational"
    | "unreachable";

/**
 * Leitura de um Feed num Poll: lida, com estado declarado e Incidents, ou não lida.
 * Um Feed não lido pode trazer os Incidents já gravados dele: entram nos Recent Incidents,
 * mas não decidem o estado nem a Upcoming Maintenance, que seriam dado velho tomado por atual.
 */
export type FeedReading =
    | { read: true; declared: DeclaredStatus; incidents: IncidentData[] }
    | { read: false; incidents?: IncidentData[] };

export interface ProviderStatusInput {
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

export interface ProviderStatusDecision {
    status: ProviderStatus;
    /** Recent Incidents em ordem de exibição: ativos primeiro, resolvidos completando até 3. */
    incidents: IncidentData[];
    upcomingMaintenance: UpcomingMaintenanceSummary | null;
}

/** Precedência dos estados que vêm de Feeds lidos, do pior para o melhor. */
const PRECEDENCE: ProviderStatus[] = ["outage", "degraded", "maintenance", "operational"];

/** Por quanto tempo um Incident resolvido continua Recent Incident, contado da resolução. */
const RECENT_INCIDENT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Tamanho da lista que os resolvidos completam; os ativos nunca são cortados. */
const RECENT_INCIDENTS_LIST_SIZE = 3;

export function decideProviderStatus(input: ProviderStatusInput): ProviderStatusDecision {
    const readIncidents = input.feeds.flatMap(f => (f.read ? f.incidents : []));
    const allIncidents = input.feeds.flatMap(f => f.incidents ?? []);

    return {
        status: decideStatus(input),
        incidents: recentIncidents(allIncidents, input.now),
        upcomingMaintenance: summarizeUpcoming(readIncidents, input.now),
    };
}

/**
 * Instante de onde conta a janela de um Incident encerrado: a resolução, ou a criação quando nem o Feed
 * nem a gravação registraram a resolução (sem esse dado, a escolha que nunca estica a janela).
 */
function closedAt(incident: IncidentData): number {
    return (incident.resolvedAt ?? incident.createdAt).getTime();
}

/**
 * Problema encerrado dentro da janela de Recent Incident. A leitura do Snapshot usa a mesma regra
 * para trazer só o que o módulo pode exibir. Manutenção completed nunca é Recent Incident.
 */
export function isRecentlyResolved(incident: IncidentData, now: Date): boolean {
    return (
        incident.kind === "problem" &&
        isClosed(incident) &&
        now.getTime() - closedAt(incident) < RECENT_INCIDENT_WINDOW_MS
    );
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
        .sort((a, b) => closedAt(b) - closedAt(a));

    return [...active, ...resolved.slice(0, Math.max(0, RECENT_INCIDENTS_LIST_SIZE - active.length))];
}

function decideStatus({ feeds, probes, previousPollUnanswered }: ProviderStatusInput): ProviderStatus {
    const readFeeds = feeds.filter(f => f.read);

    if (readFeeds.length > 0) {
        const candidates = readFeeds.map((f): ProviderStatus => {
            const ongoing = f.incidents.some(i => i.kind === "maintenance" && i.status === "in_progress");
            return f.declared === "operational" && ongoing ? "maintenance" : f.declared;
        });
        return PRECEDENCE.find(s => candidates.includes(s)) ?? "operational";
    }

    const probeAnswered = probes.some(Boolean);
    if (probeAnswered) {
        return feeds.length === 0 ? "operational" : "unreachable";
    }
    return previousPollUnanswered ? "down" : "unreachable";
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
