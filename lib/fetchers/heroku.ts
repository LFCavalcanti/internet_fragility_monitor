import { Fetcher, StatusResult, IncidentData } from "./types";

export class HerokuFetcher implements Fetcher {
    providerId: string;
    private apiUrl: string;

    /** `apiUrl` vem do Provider Catalog: nenhuma URL de Feed fica fixa no código. */
    constructor(providerId: string, apiUrl: string) {
        this.providerId = providerId;
        this.apiUrl = apiUrl;
    }

    async fetchStatus(): Promise<StatusResult> {
        try {
            const response = await fetch(this.apiUrl, { next: { revalidate: 60 } });
            if (!response.ok) {
                throw new Error(`Failed to fetch Heroku status: ${response.statusText}`);
            }
            const data = await response.json();

            // Heroku returns status for "production" and "development"
            // We'll check "production" for the main status
            const productionStatus = data.status.find((s: any) => s.system === "Apps");
            const status = this.mapStatus(productionStatus?.status);

            const incidents = data.incidents.map((inc: any) => this.mapIncident(inc));

            return {
                providerId: this.providerId,
                status,
                incidents,
            };
        } catch (error) {
            console.error("Error fetching Heroku status:", error);
            return {
                providerId: this.providerId,
                status: "unreachable",
                incidents: [],
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
            kind: "problem",
            title: incident.title,
            description: incident.updates?.[0]?.contents,
            url: incident.full_url,
            status: "investigating", // Heroku API doesn't map 1:1 to our status types easily, defaulting to investigating for active
            createdAt: new Date(incident.created_at),
            updatedAt: incident.updated_at ? new Date(incident.updated_at) : undefined,
        };
    }
}
