import { Fetcher, StatusResult, IncidentData } from "./types";
import { XMLParser } from "fast-xml-parser";

export class AzureFetcher implements Fetcher {
    providerId = "azure";
    private rssUrl = "https://azure.status.microsoft/en-us/status/feed/";

    async fetchStatus(): Promise<StatusResult> {
        const start = Date.now();
        try {
            const response = await fetch(this.rssUrl, { next: { revalidate: 60 } });
            if (!response.ok) {
                throw new Error(`Failed to fetch Azure status: ${response.statusText}`);
            }
            const xml = await response.text();
            const parser = new XMLParser();
            const data = parser.parse(xml);
            const responseTime = Date.now() - start;

            const items = data.rss?.channel?.item || [];
            const incidents: IncidentData[] = (Array.isArray(items) ? items : [items]).map((item: any) => this.mapIncident(item));

            const recentIncidents = incidents.filter(inc => {
                const age = Date.now() - inc.createdAt.getTime();
                return age < 24 * 60 * 60 * 1000;
            });

            const hasActive = recentIncidents.some(inc => inc.status !== 'resolved');
            const status = hasActive ? 'degraded' : 'operational';

            return {
                providerId: this.providerId,
                status,
                incidents: recentIncidents,
                responseTime,
            };
        } catch (error) {
            console.error("Error fetching Azure status:", error);
            return {
                providerId: this.providerId,
                status: "outage",
                incidents: [],
                responseTime: 0,
            };
        }
    }

    private mapIncident(item: any): IncidentData {
        const title = item.title || "Unknown Issue";
        const isResolved = title.toLowerCase().includes("resolved") || item.description?.toLowerCase().includes("resolved");

        return {
            title,
            description: item.description,
            url: item.link,
            status: isResolved ? "resolved" : "investigating",
            createdAt: new Date(item.pubDate),
        };
    }
}
