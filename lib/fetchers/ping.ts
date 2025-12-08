import { Fetcher, StatusResult } from "./types";

export class PingFetcher implements Fetcher {
    providerId: string;
    private url: string;

    constructor(providerId: string, url: string) {
        this.providerId = providerId;
        this.url = url;
    }

    async fetchStatus(): Promise<StatusResult> {
        const start = Date.now();
        try {
            // We use 'no-cors' mode if running in browser, but here in Node/Next.js server side we can just fetch.
            // However, some sites block HEAD requests or automated requests.
            // We'll try a simple GET with a short timeout.
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            const response = await fetch(this.url, {
                method: 'HEAD',
                signal: controller.signal,
                next: { revalidate: 60 }
            });
            clearTimeout(timeoutId);

            const responseTime = Date.now() - start;

            // If we get a response (even 404 or 403), the server is technically "up" / reachable.
            // But ideally we want 2xx.
            // Many sites return 405 Method Not Allowed for HEAD, which still means it's up.
            const isUp = response.status >= 200 && response.status < 600;

            return {
                providerId: this.providerId,
                status: isUp ? "operational" : "outage",
                incidents: [],
                responseTime,
            };
        } catch (error) {
            console.error(`Error pinging ${this.providerId}:`, error);
            // If fetch fails (network error, timeout), assume outage
            return {
                providerId: this.providerId,
                status: "outage",
                incidents: [],
                responseTime: 0,
            };
        }
    }
}
