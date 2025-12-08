import { Fetcher, StatusResult, IncidentData } from "./types";

export class GitHubFetcher implements Fetcher {
    providerId = "github";
    private apiUrl = "https://www.githubstatus.com/api/v2/summary.json";

    async fetchStatus(): Promise<StatusResult> {
        const start = Date.now();
        try {
            const response = await fetch(this.apiUrl, { next: { revalidate: 60 } });
            if (!response.ok) {
                throw new Error(`Failed to fetch GitHub status: ${response.statusText}`);
            }
            const data = await response.json();
            const responseTime = Date.now() - start;

            const status = this.mapStatus(data.status.indicator);
            const incidents = data.incidents.map((inc: any) => this.mapIncident(inc));

            return {
                providerId: this.providerId,
                status,
                incidents,
                responseTime,
            };
        } catch (error) {
            console.error("Error fetching GitHub status:", error);
            return {
                providerId: this.providerId,
                status: "outage",
                incidents: [],
                responseTime: 0,
            };
        }
    }

    private mapStatus(indicator: string): "operational" | "degraded" | "outage" {
        switch (indicator) {
            case "none":
                return "operational";
            case "minor":
                return "degraded";
            case "major":
            case "critical":
                return "outage";
            default:
                return "operational";
        }
    }

    private mapIncident(incident: any): IncidentData {
        return {
            title: incident.name,
            description: incident.incident_updates?.[0]?.body || incident.shortlink,
            url: incident.shortlink,
            status: this.mapIncidentStatus(incident.status),
            createdAt: new Date(incident.created_at),
            updatedAt: incident.updated_at ? new Date(incident.updated_at) : undefined,
        };
    }

    private mapIncidentStatus(status: string): "investigating" | "identified" | "monitoring" | "resolved" {
        switch (status) {
            case "investigating":
                return "investigating";
            case "identified":
                return "identified";
            case "monitoring":
                return "monitoring";
            case "resolved":
                return "resolved";
            default:
                return "investigating";
        }
    }
}
