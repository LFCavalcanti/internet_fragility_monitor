import { Fetcher, StatusResult, IncidentData } from "./types";
import { XMLParser } from "fast-xml-parser";

export class AWSFetcher implements Fetcher {
    providerId = "aws";
    private rssUrl = "https://status.aws.amazon.com/rss/all.rss";

    async fetchStatus(): Promise<StatusResult> {
        const start = Date.now();
        try {
            const response = await fetch(this.rssUrl, { next: { revalidate: 60 } });
            if (!response.ok) {
                throw new Error(`Failed to fetch AWS status: ${response.statusText}`);
            }
            const xml = await response.text();
            const parser = new XMLParser();
            const data = parser.parse(xml);
            const responseTime = Date.now() - start;

            const items = data.rss?.channel?.item || [];
            const incidents: IncidentData[] = (Array.isArray(items) ? items : [items]).map((item: any) => this.mapIncident(item));

            // No age cut: the Provider Status module decides which Incidents are Recent Incidents.
            // If any incident is not resolved, it's degraded
            const hasActive = incidents.some(inc => inc.status !== 'resolved');
            const status = hasActive ? 'degraded' : 'operational';

            return {
                providerId: this.providerId,
                status,
                incidents,
                responseTime,
            };
        } catch (error) {
            console.error("Error fetching AWS status:", error);
            return {
                providerId: this.providerId,
                status: "unreachable",
                incidents: [],
                responseTime: 0,
            };
        }
    }

    private mapIncident(item: any): IncidentData {
        const title = item.title || "Unknown Issue";
        const isResolved = title.toLowerCase().includes("resolved");

        return {
            kind: "problem",
            title,
            description: item.description,
            url: item.link,
            status: isResolved ? "resolved" : "investigating",
            createdAt: new Date(item.pubDate),
        };
    }
}
