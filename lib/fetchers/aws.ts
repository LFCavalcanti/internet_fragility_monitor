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

            // Filter for recent incidents (last 24h)
            const recentIncidents = incidents.filter(inc => {
                const age = Date.now() - inc.createdAt.getTime();
                return age < 24 * 60 * 60 * 1000;
            });

            // Determine status based on recent incidents
            // If any recent incident is not resolved, it's degraded
            const hasActive = recentIncidents.some(inc => inc.status !== 'resolved');
            const status = hasActive ? 'degraded' : 'operational';

            return {
                providerId: this.providerId,
                status,
                incidents: recentIncidents,
                responseTime,
            };
        } catch (error) {
            console.error("Error fetching AWS status:", error);
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
        const isResolved = title.toLowerCase().includes("resolved");

        return {
            title,
            description: item.description,
            url: item.link,
            status: isResolved ? "resolved" : "investigating",
            createdAt: new Date(item.pubDate),
        };
    }
}
