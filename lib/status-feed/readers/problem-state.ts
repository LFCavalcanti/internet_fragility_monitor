import { isClosed } from "../../incident-status";
import type { DeclaredStatus, ProblemStatus, PublishedIncident } from "../types";

/** Fase de um problema nos Feeds que só dizem se ele já terminou. */
export function problemPhase(resolved: boolean): ProblemStatus {
    return resolved ? "resolved" : "investigating";
}

/** Estado declarado pelos Feeds que não publicam gravidade: Degraded com algum problema aberto. Manutenção não conta. */
export function declaredByOpenProblems(incidents: PublishedIncident[]): DeclaredStatus {
    return incidents.some(i => i.kind === "problem" && !isClosed(i)) ? "degraded" : "operational";
}
