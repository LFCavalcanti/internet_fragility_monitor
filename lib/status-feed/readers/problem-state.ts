import { isClosed } from "../../incident-status";
import type { DeclaredStatus, ProblemStatus, PublishedIncident } from "../types";

/** Fase de um problema nos Feeds que só dizem se ele já terminou. */
export function problemPhase(resolved: boolean): ProblemStatus {
    return resolved ? "resolved" : "investigating";
}

/** Uma manutenção em andamento só vale quando não há nada a declarar: Maintenance nunca prevalece sobre um problema. */
export function withOngoingMaintenance(declared: DeclaredStatus, incidents: PublishedIncident[]): DeclaredStatus {
    const ongoing = incidents.some(i => i.kind === "maintenance" && i.status === "in_progress");
    return declared === "operational" && ongoing ? "maintenance" : declared;
}

/** Estado declarado pelos Feeds que não publicam gravidade: Degraded com algum problema aberto. */
export function declaredByOpenProblems(incidents: PublishedIncident[]): DeclaredStatus {
    const problemOpen = incidents.some(i => i.kind === "problem" && !isClosed(i));
    return withOngoingMaintenance(problemOpen ? "degraded" : "operational", incidents);
}
