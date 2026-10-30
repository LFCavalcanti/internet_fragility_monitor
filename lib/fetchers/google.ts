import { Fetcher, StatusResult, IncidentData } from "./types";

export class GoogleCloudFetcher implements Fetcher {
    providerId: string;
    private apiUrl: string;

    /** `apiUrl` vem do Provider Catalog: nenhuma URL de Feed fica fixa no código. */
    constructor(providerId: string, apiUrl: string) {
        this.providerId = providerId;
        this.apiUrl = apiUrl;
    }

    async fetchStatus(): Promise<StatusResult> {
        const start = Date.now();
        try {
            const response = await fetch(this.apiUrl, { next: { revalidate: 60 } });
            if (!response.ok) {
                throw new Error(`Failed to fetch GCP status: ${response.statusText}`);
            }
            const data = await response.json();
            const responseTime = Date.now() - start;

            // GCP JSON returns a list of incidents.
            // We need to check if any are active.
            // The structure is usually an array of objects.

            const incidents: IncidentData[] = data.map((inc: any) => this.mapIncident(inc));

            // No age cut: the Provider Status module decides which Incidents are Recent Incidents.
            const activeIncidents = incidents.filter(inc => inc.status !== 'resolved');

            const status = activeIncidents.length > 0 ? 'degraded' : 'operational';

            return {
                providerId: this.providerId,
                status,
                incidents,
                responseTime,
            };
        } catch (error) {
            console.error("Error fetching GCP status:", error);
            return {
                providerId: this.providerId,
                status: "unreachable",
                incidents: [],
                responseTime: 0,
            };
        }
    }

    private mapIncident(incident: any): IncidentData {
        // GCP incident structure varies, but usually has:
        // external_desc, begin, end, service_name, severity

        const isResolved = !!incident.end;

        return {
            kind: "problem",
            title: incident.service_name + ": " + (incident.external_desc || "Issue"),
            description: incident.updates?.[0]?.text || incident.external_desc,
            url: incident.uri,
            status: isResolved ? "resolved" : "investigating",
            createdAt: new Date(incident.begin),
            updatedAt: incident.modified ? new Date(incident.modified) : undefined,
            // GCP incidents have an 'end' time once resolved: the Recent Incident window counts from it.
            resolvedAt: isResolved ? new Date(incident.end) : undefined,
        };
    }
}
