/**
 * A regra única de Incident encerrado: problema resolved, manutenção completed.
 * Todo lugar que pergunta se um Incident está aberto ou encerrado usa este módulo.
 * Termos conforme GLOSSARY.md.
 */
import type { IncidentKind, MaintenancePhase, ProblemStatus } from "./fetchers/types";

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
