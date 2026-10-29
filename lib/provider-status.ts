/**
 * Provider Status: o único lugar que decide o estado de um Provider num Snapshot.
 * Módulo puro: recebe as leituras e o relógio, não lê banco nem rede.
 * Termos conforme GLOSSARY.md.
 */
import type { DeclaredState, IncidentData, MaintenanceIncident } from "./fetchers/types";

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
    | { read: true; declared: DeclaredState; incidents: IncidentData[] }
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
    /** Incidents a exibir: problemas e manutenções em andamento. */
    incidents: IncidentData[];
    upcomingMaintenance: UpcomingMaintenanceSummary | null;
}

/** Precedência dos estados que vêm de Feeds lidos, do pior para o melhor. */
const PRECEDENCE: ProviderStatus[] = ["outage", "degraded", "maintenance", "operational"];

export function decideProviderStatus(input: ProviderStatusInput): ProviderStatusDecision {
    const readIncidents = input.feeds.flatMap(f => (f.read ? f.incidents : []));
    const allIncidents = input.feeds.flatMap(f => f.incidents ?? []);

    return {
        status: decideStatus(input),
        incidents: allIncidents.filter(isVisible),
        upcomingMaintenance: summarizeUpcoming(readIncidents),
    };
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

function isVisible(incident: IncidentData): boolean {
    return incident.kind === "problem" || incident.status === "in_progress";
}

function summarizeUpcoming(incidents: IncidentData[]): UpcomingMaintenanceSummary | null {
    const scheduled = incidents.filter(
        (i): i is MaintenanceIncident => i.kind === "maintenance" && i.status === "scheduled",
    );
    if (scheduled.length === 0) return null;

    const dates = scheduled.flatMap(i => (i.scheduledFor ? [i.scheduledFor.getTime()] : []));

    return {
        count: scheduled.length,
        next: dates.length > 0 ? new Date(Math.min(...dates)) : null,
    };
}
