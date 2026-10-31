/** Estado que o próprio Provider declara num Feed. */
export type DeclaredStatus = 'operational' | 'degraded' | 'outage';

/**
 * Resultado gravado de uma leitura: o estado declarado pelo Feed, ou "unreachable" quando
 * ele não pôde ser lido. Falha de leitura nunca é Outage.
 */
export type ReadingStatus = DeclaredStatus | 'unreachable';

/** A leitura gravada de um Provider no último Poll, como a leitura do Snapshot a devolve. */
export interface StatusResult {
    providerId: string;
    /**
     * O que o último Poll gravou (`toRecordedReadings` em lib/snapshot-reading.ts): uma leitura por Feed ou,
     * em Provider só com Probes, uma só. O estado do Provider é decidido a partir delas pelo módulo de Provider Status.
     */
    readings: ReadingStatus[];
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

/** Um Incident como o Feed o publica, com o id que o Feed dá a ele. A Provider Source é posta pela política de leitura. */
export type PublishedIncident = IncidentData & { externalId: string };

/**
 * Incident lido de um Feed, com a identidade: a Provider Source de origem e o id que o Feed dá a ele.
 * Os Incidents vindos do banco são `IncidentData`, sem esses campos, até o Ticket 14 gravá-los.
 */
export type ReadIncident = PublishedIncident & { sourceId: string };
