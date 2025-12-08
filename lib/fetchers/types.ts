export interface StatusResult {
    providerId: string;
    status: 'operational' | 'degraded' | 'outage';
    incidents: IncidentData[];
    responseTime?: number;
    lastUpdated?: Date;
}

export interface IncidentData {
    title: string;
    description?: string;
    url?: string;
    status: 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'maintenance';
    createdAt: Date;
    updatedAt?: Date;
}

export interface Fetcher {
    providerId: string;
    fetchStatus(): Promise<StatusResult>;
}
