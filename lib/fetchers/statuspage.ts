import {
    Fetcher,
    StatusResult,
    DeclaredStatus,
    MaintenanceIncident,
    MaintenancePhase,
    ProblemIncident,
    ProblemStatus,
} from "./types";

/** Item das listas `incidents` e `scheduled_maintenances` do summary.json (só os campos lidos). */
interface StatuspageItem {
    name: string;
    status: string;
    shortlink?: string;
    created_at: string;
    updated_at?: string | null;
    scheduled_for?: string | null;
    incident_updates?: { body?: string }[];
}

interface StatuspageSummary {
    status: { indicator: string };
    incidents?: StatuspageItem[];
    scheduled_maintenances?: StatuspageItem[];
}

/**
 * Leitor da família Statuspage.io (summary.json).
 * A classificação vem do próprio Feed: a lista `incidents` traz problemas e a lista
 * `scheduled_maintenances` traz manutenções, cada uma com a fase declarada.
 */
export class StatusPageFetcher implements Fetcher {
    providerId: string;
    private statusPageUrl: string;

    constructor(providerId: string, statusPageUrl: string) {
        this.providerId = providerId;
        this.statusPageUrl = statusPageUrl;
    }

    async fetchStatus(): Promise<StatusResult> {
        const start = Date.now();
        try {
            const response = await fetch(`${this.statusPageUrl}/api/v2/summary.json`, { next: { revalidate: 60 } });
            if (!response.ok) {
                throw new Error(`Failed to fetch ${this.providerId} status: ${response.statusText}`);
            }
            const data = (await response.json()) as StatuspageSummary;
            const responseTime = Date.now() - start;

            const status = this.mapStatus(data.status.indicator);
            const incidents = [
                ...(data.incidents || []).map(inc => this.mapProblem(inc)),
                ...(data.scheduled_maintenances || []).map(inc => this.mapMaintenance(inc)),
            ];

            return {
                providerId: this.providerId,
                status,
                incidents,
                responseTime,
            };
        } catch (error) {
            console.error(`Error fetching ${this.providerId} status:`, error);
            return {
                providerId: this.providerId,
                status: "unreachable",
                incidents: [],
                responseTime: 0,
            };
        }
    }

    private mapStatus(indicator: string): DeclaredStatus {
        switch (indicator) {
            case "minor":
                return "degraded";
            case "major":
            case "critical":
                return "outage";
            default:
                // "none" e "maintenance": Maintenance vem das manutenções em andamento, não do indicador
                return "operational";
        }
    }

    private mapProblem(incident: StatuspageItem): ProblemIncident {
        return {
            kind: "problem",
            ...this.mapCommon(incident),
            status: this.mapProblemStatus(incident.status),
        };
    }

    private mapMaintenance(incident: StatuspageItem): MaintenanceIncident {
        return {
            kind: "maintenance",
            ...this.mapCommon(incident),
            status: this.mapMaintenancePhase(incident.status),
            scheduledFor: incident.scheduled_for ? new Date(incident.scheduled_for) : undefined,
        };
    }

    private mapCommon(incident: StatuspageItem) {
        return {
            title: incident.name,
            description: incident.incident_updates?.[0]?.body || incident.shortlink || "",
            url: incident.shortlink,
            createdAt: new Date(incident.created_at),
            updatedAt: incident.updated_at ? new Date(incident.updated_at) : undefined,
        };
    }

    private mapProblemStatus(status: string): ProblemStatus {
        switch (status) {
            case "identified":
                return "identified";
            case "monitoring":
                return "monitoring";
            case "resolved":
            case "postmortem":
                return "resolved";
            default:
                return "investigating";
        }
    }

    private mapMaintenancePhase(status: string): MaintenancePhase {
        switch (status) {
            case "in_progress":
            case "verifying":
                return "in_progress";
            case "completed":
                return "completed";
            default:
                return "scheduled";
        }
    }
}
