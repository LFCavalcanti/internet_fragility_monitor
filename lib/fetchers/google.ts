import { Fetcher, StatusResult, IncidentData } from "./types";

export class GoogleCloudFetcher implements Fetcher {
    providerId = "google-cloud";
    private apiUrl = "https://status.cloud.google.com/incidents.json";

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

            // Filter for recent (last 24h) or active
            // GCP incidents usually have 'end' time if resolved.

            const activeIncidents = incidents.filter(inc => inc.status !== 'resolved');
            const recentIncidents = incidents.filter(inc => {
                const age = Date.now() - inc.createdAt.getTime();
                return age < 24 * 60 * 60 * 1000;
            });

            const status = activeIncidents.length > 0 ? 'degraded' : 'operational';

            return {
                providerId: this.providerId,
                status,
                incidents: recentIncidents,
                responseTime,
            };
        } catch (error) {
            console.error("Error fetching GCP status:", error);
            return {
                providerId: this.providerId,
                status: "outage",
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
            title: incident.service_name + ": " + (incident.external_desc || "Issue"),
            description: incident.updates?.[0]?.text || incident.external_desc,
            url: incident.uri,
            status: isResolved ? "resolved" : "investigating",
            createdAt: new Date(incident.begin),
            updatedAt: incident.modified ? new Date(incident.modified) : undefined,
        };
    }
}
