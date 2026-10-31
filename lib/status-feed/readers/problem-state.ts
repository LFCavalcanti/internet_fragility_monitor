import { isClosed } from "../../incident-status";
import { worstDeclared } from "../../provider-status";
import type { DeclaredStatus, ProblemStatus, PublishedIncident } from "../types";

/** Gravidade de um problema publicado. Só existe na leitura: não é gravada. */
export type ProblemSeverity = Extract<DeclaredStatus, "outage" | "degraded">;

/** Sem novidade do Provider há mais do que isto, um Incident ativo é Dormant Incident. O limite existe só aqui. */
const DORMANT_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Fase de um problema nos Feeds que só dizem se ele já terminou. */
export function problemPhase(resolved: boolean): ProblemStatus {
    return resolved ? "resolved" : "investigating";
}

/** Uma manutenção em andamento só vale quando não há nada a declarar: Maintenance nunca prevalece sobre um problema. */
export function withOngoingMaintenance(declared: DeclaredStatus, incidents: PublishedIncident[]): DeclaredStatus {
    const ongoing = incidents.some(i => i.kind === "maintenance" && i.status === "in_progress");
    return declared === "operational" && ongoing ? "maintenance" : declared;
}

/** A referência é a última atualização publicada e, sem ela, a criação. Uma atualização nova faz o Incident voltar a contar. */
function isDormant(incident: PublishedIncident, pollAt: Date): boolean {
    const lastNews = incident.updatedAt ?? incident.createdAt;
    return pollAt.getTime() - lastNews.getTime() > DORMANT_AFTER_MS;
}

/**
 * Estado declarado pelos Feeds sem estado geral, a partir dos Incidents ativos que não são Dormant Incidents: o pior
 * entre os problemas abertos; sem nenhum, Maintenance se houver manutenção em andamento; senão, Operational.
 * `severityOf` diz a gravidade de cada problema publicado, Outage ou Degraded; o leitor que não sabe dizer usa o padrão,
 * Degraded. Quem decide que um Incident não muda o estado o deixa fora da lista. Os Feeds com estado geral não usam esta regra.
 */
export function declaredByActiveIncidents(
    incidents: PublishedIncident[],
    pollAt: Date,
    severityOf: (problem: PublishedIncident) => ProblemSeverity = () => "degraded",
): DeclaredStatus {
    const counting = incidents.filter(incident => !isDormant(incident, pollAt));
    const severities = counting.filter(incident => incident.kind === "problem" && !isClosed(incident)).map(severityOf);
    return withOngoingMaintenance(worstDeclared(severities) ?? "operational", counting);
}
