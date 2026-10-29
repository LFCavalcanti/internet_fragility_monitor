/** Estado que o próprio Provider declara num Feed. */
export type DeclaredState = 'operational' | 'degraded' | 'outage';

/**
 * Resultado de uma leitura: o estado declarado pelo Feed, ou "unreachable" quando
 * a status page não pôde ser lida. Falha de leitura nunca é Outage.
 */
export type ReadingStatus = DeclaredState | 'unreachable';

export interface StatusResult {
    providerId: string;
    status: ReadingStatus;
    incidents: IncidentData[];
    responseTime?: number;
    lastUpdated?: Date;
}

export type ProblemStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type MaintenancePhase = 'scheduled' | 'in_progress' | 'completed';
export type IncidentKind = 'problem' | 'maintenance';

interface IncidentBase {
    title: string;
    description?: string;
    url?: string;
    createdAt: Date;
    updatedAt?: Date;
}

/** Incident do tipo problema: falha publicada pelo Provider. */
export interface ProblemIncident extends IncidentBase {
    kind: 'problem';
    status: ProblemStatus;
}

/** Incident do tipo manutenção, com a fase declarada pelo Feed e a data marcada para começar. */
export interface MaintenanceIncident extends IncidentBase {
    kind: 'maintenance';
    status: MaintenancePhase;
    scheduledFor?: Date;
}

export type IncidentData = ProblemIncident | MaintenanceIncident;

export interface Fetcher {
    providerId: string;
    fetchStatus(): Promise<StatusResult>;
}
