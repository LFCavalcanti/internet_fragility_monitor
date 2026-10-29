import { AWSFetcher } from "./aws";
import { AzureFetcher } from "./azure";
import { CloudflareFetcher } from "./cloudflare";
import { GoogleCloudFetcher } from "./google";
import { VercelFetcher } from "./vercel";
import { GitHubFetcher } from "./github";
import { StatusPageFetcher } from "./statuspage";
import { HerokuFetcher } from "./heroku";
import { PingFetcher } from "./ping";
import { Fetcher, StatusResult } from "./types";

const fetchers: Fetcher[] = [
    new AWSFetcher(),
    new GoogleCloudFetcher(),
    new AzureFetcher(),
    new CloudflareFetcher(),
    new VercelFetcher(),
    new GitHubFetcher(),
    // New Providers
    new StatusPageFetcher("jira", "https://jira-software.status.atlassian.com"),
    new PingFetcher("ibm-cloud", "https://cloud.ibm.com/status"),
    new StatusPageFetcher("digital-ocean", "https://status.digitalocean.com"),
    new PingFetcher("salesforce", "https://www.salesforce.com"),
    new PingFetcher("oracle-cloud", "https://ocistatus.oraclecloud.com/"),
    new StatusPageFetcher("hostinger", "https://statuspage.hostinger.com"),
    new HerokuFetcher(),
];

export async function fetchAllStatuses(): Promise<StatusResult[]> {
    const results = await Promise.all(fetchers.map(f => f.fetchStatus()));
    return results;
}
