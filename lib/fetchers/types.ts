/** Estado que o próprio Provider declara num Feed. */
export type DeclaredStatus = 'operational' | 'degraded' | 'outage';

/**
 * Resultado de uma leitura: o estado declarado pelo Feed, ou "unreachable" quando
 * a status page não pôde ser lida. Falha de leitura nunca é Outage.
 */
export type ReadingStatus = DeclaredStatus | 'unreachable';

export interface StatusResult {
    providerId: string;
    status: ReadingStatus;
    incidents: IncidentData[];
    lastUpdated?: Date;
    /**
     * Marca de "só acesso" (`isAccessOnly` em lib/provider-catalog.ts): o Provider não tem Feed ativo e a leitura
     * vem só dos Probes, que não declaram estado nem Incidents.
     */
    accessOnly?: boolean;
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
    /** Hora em que o Incident foi encerrado (resolved ou completed), quando conhecida. */
    resolvedAt?: Date;
    /**
     * Identidade do Incident lido: a Provider Source de origem e o id que o Feed dá a ele. Ausentes nos Incidents
     * vindos do banco, que só os grava com o Ticket 14, e nos leitores que o Ticket 10 leva à política de leitura.
     */
    sourceId?: string;
    externalId?: string;
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
