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

export const providersList = [
    { id: "aws", name: "AWS", url: "https://aws.amazon.com", statusPageUrl: "https://health.aws.amazon.com/health/status", type: "cloud", logo: "https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg" },
    { id: "google-cloud", name: "Google Cloud", url: "https://cloud.google.com", statusPageUrl: "https://status.cloud.google.com", type: "cloud", logo: "https://cdn.simpleicons.org/googlecloud/FFA94D" },
    { id: "azure", name: "Azure", url: "https://azure.microsoft.com", statusPageUrl: "https://azure.status.microsoft/en-us/status", type: "cloud", logo: "https://upload.wikimedia.org/wikipedia/commons/a/a8/Microsoft_Azure_Logo.svg" },
    { id: "cloudflare", name: "Cloudflare", url: "https://cloudflare.com", statusPageUrl: "https://www.cloudflarestatus.com", type: "cdn", logo: "https://cdn.simpleicons.org/cloudflare/FFA94D" },
    { id: "vercel", name: "Vercel", url: "https://vercel.com", statusPageUrl: "https://www.vercel-status.com", type: "paas", logo: "https://cdn.simpleicons.org/vercel/FFA94D" },
    { id: "github", name: "GitHub", url: "https://githubstatus.com", statusPageUrl: "https://www.githubstatus.com", type: "paas", logo: "https://cdn.simpleicons.org/github/FFA94D" },
    // New Providers Metadata
    { id: "jira", name: "Jira", url: "https://www.atlassian.com/software/jira", statusPageUrl: "https://jira-software.status.atlassian.com", type: "saas", logo: "https://cdn.simpleicons.org/jira/FFA94D" },
    { id: "ibm-cloud", name: "IBM Cloud", url: "https://cloud.ibm.com", statusPageUrl: "https://cloud.ibm.com/status", type: "cloud", logo: "https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg" },
    { id: "digital-ocean", name: "DigitalOcean", url: "https://www.digitalocean.com", statusPageUrl: "https://status.digitalocean.com", type: "cloud", logo: "https://cdn.simpleicons.org/digitalocean/FFA94D" },
    { id: "salesforce", name: "Salesforce", url: "https://www.salesforce.com", statusPageUrl: "https://status.salesforce.com", type: "saas", logo: "https://cdn.simpleicons.org/salesforce/FFA94D" },
    { id: "oracle-cloud", name: "Oracle Cloud", url: "https://www.oracle.com/cloud/", statusPageUrl: "https://ocistatus.oraclecloud.com", type: "cloud", logo: "https://upload.wikimedia.org/wikipedia/commons/5/50/Oracle_logo.svg" },
    { id: "hostinger", name: "Hostinger", url: "https://www.hostinger.com", statusPageUrl: "https://statuspage.hostinger.com", type: "hosting", logo: "https://cdn.simpleicons.org/hostinger/FFA94D" },
    { id: "heroku", name: "Heroku", url: "https://www.heroku.com", statusPageUrl: "https://status.heroku.com", type: "paas", logo: "https://cdn.simpleicons.org/heroku/FFA94D" },
];
