import { Fetcher, StatusResult, IncidentData } from "./types";

export class HerokuFetcher implements Fetcher {
    providerId = "heroku";
    private apiUrl = "https://status.heroku.com/api/v4/current-status";

    async fetchStatus(): Promise<StatusResult> {
        const start = Date.now();
        try {
            const response = await fetch(this.apiUrl, { next: { revalidate: 60 } });
            if (!response.ok) {
                throw new Error(`Failed to fetch Heroku status: ${response.statusText}`);
            }
            const data = await response.json();
            const responseTime = Date.now() - start;

            // Heroku returns status for "production" and "development"
            // We'll check "production" for the main status
            const productionStatus = data.status.find((s: any) => s.system === "Apps");
            const status = this.mapStatus(productionStatus?.status);

            const incidents = data.incidents.map((inc: any) => this.mapIncident(inc));

            return {
                providerId: this.providerId,
                status,
                incidents,
                responseTime,
            };
        } catch (error) {
            console.error("Error fetching Heroku status:", error);
            return {
                providerId: this.providerId,
                status: "outage",
                incidents: [],
                responseTime: 0,
            };
        }
    }

    private mapStatus(color: string): "operational" | "degraded" | "outage" {
        switch (color) {
            case "green":
                return "operational";
            case "yellow":
                return "degraded";
            case "red":
                return "outage";
            default:
                return "operational";
        }
    }

    private mapIncident(incident: any): IncidentData {
        return {
            title: incident.title,
            description: incident.updates?.[0]?.contents,
            url: incident.full_url,
            status: "investigating", // Heroku API doesn't map 1:1 to our status types easily, defaulting to investigating for active
            createdAt: new Date(incident.created_at),
            updatedAt: incident.updated_at ? new Date(incident.updated_at) : undefined,
        };
    }
}
