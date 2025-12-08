import { CloudflareFetcher } from "./lib/fetchers/cloudflare";

async function main() {
    console.log("Fetching Cloudflare status...");
    const fetcher = new CloudflareFetcher();
    // We need to access the private apiUrl or just duplicate the fetch logic here for raw output
    const apiUrl = "https://www.cloudflarestatus.com/api/v2/summary.json";

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        console.log("--- Raw API Response ---");
        console.log(JSON.stringify(data, null, 2));
        console.log("------------------------");

        const result = await fetcher.fetchStatus();
        console.log("--- Fetcher Result ---");
        console.log(JSON.stringify(result, null, 2));
        console.log("----------------------");
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
