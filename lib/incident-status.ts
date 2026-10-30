/**
 * A regra única de Incident encerrado: problema resolved, manutenção completed.
 * Todo lugar que pergunta se um Incident está aberto ou encerrado usa este módulo.
 * Termos conforme GLOSSARY.md.
 */
import type { IncidentData, IncidentKind, MaintenancePhase, ProblemStatus } from "./fetchers/types";

/** Status de um Incident: a fase de um problema ou de uma manutenção. */
export type IncidentStatus = ProblemStatus | MaintenancePhase;

/** Status em que um Incident está encerrado. */
export const CLOSED_STATUSES: readonly IncidentStatus[] = ["resolved", "completed"];

export function isClosed(incident: { status: IncidentStatus }): boolean {
    return CLOSED_STATUSES.includes(incident.status);
}

/** Status com que um Incident do tipo dado é encerrado. */
export function closedStatusFor(kind: IncidentKind): IncidentStatus {
    return kind === "maintenance" ? "completed" : "resolved";
}

/** Por quanto tempo um Incident resolvido continua Recent Incident, contado da resolução. */
const RECENT_INCIDENT_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Instante, em milissegundos, de onde conta a janela de um Incident encerrado: a resolução, ou a criação
 * quando nem o Feed nem a gravação registraram a resolução (sem esse dado, a escolha que nunca estica a janela).
 */
export function closedAtMs(incident: IncidentData): number {
    return (incident.resolvedAt ?? incident.createdAt).getTime();
}

/**
 * Problema encerrado dentro da janela de Recent Incident. O módulo de Provider Status e a leitura do Snapshot
 * usam esta mesma regra. Manutenção completed nunca é Recent Incident.
 */
export function isRecentlyResolved(incident: IncidentData, now: Date): boolean {
    return (
        incident.kind === "problem" &&
        isClosed(incident) &&
        now.getTime() - closedAtMs(incident) < RECENT_INCIDENT_WINDOW_MS
    );
}
