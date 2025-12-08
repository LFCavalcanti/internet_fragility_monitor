import { Fetcher, StatusResult, IncidentData } from "./types";

export class CloudflareFetcher implements Fetcher {
    providerId = "cloudflare";
    private apiUrl = "https://www.cloudflarestatus.com/api/v2/summary.json";

    async fetchStatus(): Promise<StatusResult> {
        const start = Date.now();
        try {
            const response = await fetch(this.apiUrl, { next: { revalidate: 60 } });
            if (!response.ok) {
                throw new Error(`Failed to fetch Cloudflare status: ${response.statusText}`);
            }
            const data = await response.json();
            const responseTime = Date.now() - start;

            const status = this.mapStatus(data.status.indicator);
            const incidents = [
                ...data.incidents.map((inc: any) => this.mapIncident(inc)),
                ...(data.scheduled_maintenances || []).map((inc: any) => this.mapIncident(inc))
            ];

            return {
                providerId: this.providerId,
                status,
                incidents,
                responseTime,
            };
        } catch (error) {
            console.error("Error fetching Cloudflare status:", error);
            return {
                providerId: this.providerId,
                status: "outage", // Assume outage on fetch failure? Or maybe 'unknown' but schema has 'outage'
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
        const title = incident.name;
        const description = incident.incident_updates?.[0]?.body || incident.shortlink || "";

        let status = this.mapIncidentStatus(incident.status);

        // Heuristic: If title or description contains "maintenance", force status to 'maintenance'
        if (
            title.toLowerCase().includes("maintenance") ||
            description.toLowerCase().includes("maintenance") ||
            title.toLowerCase().includes("scheduled")
        ) {
            status = "maintenance";
        }

        return {
            title,
            description,
            url: incident.shortlink,
            status,
            createdAt: new Date(incident.created_at),
            updatedAt: incident.updated_at ? new Date(incident.updated_at) : undefined,
        };
    }

    private mapIncidentStatus(status: string): "investigating" | "identified" | "monitoring" | "resolved" | "maintenance" {
        switch (status) {
            case "investigating":
                return "investigating";
            case "identified":
                return "identified";
            case "monitoring":
                return "monitoring";
            case "resolved":
                return "resolved";
            case "scheduled":
            case "maintenance":
                return "maintenance";
            default:
                return "investigating";
        }
    }
}
