import { AWSFetcher } from "./aws";
import { AzureFetcher } from "./azure";
import { GoogleCloudFetcher } from "./google";
import { StatusPageFetcher } from "./statuspage";
import { HerokuFetcher } from "./heroku";
import { readProbes } from "./probe";
import { Fetcher, StatusResult } from "./types";
import { getActiveProviders, getActiveSources } from "../dao";
import { isFeedFamily, type FeedFamily } from "../provider-catalog";
import type { ProviderSource } from "../schema";

/**
 * Leitor de cada família de Feed, montado com a URL do Provider Catalog.
 * Salesforce e RSS da IBM ainda não têm leitor (Ticket 11): um Feed ativo delas vira Feed não lido.
 */
const FEED_READERS: Partial<Record<FeedFamily, (providerId: string, url: string) => Fetcher>> = {
    statuspage: (id, url) => new StatusPageFetcher(id, url),
    "aws-rss": (id, url) => new AWSFetcher(id, url),
    "azure-rss": (id, url) => new AzureFetcher(id, url),
    "google-cloud": (id, url) => new GoogleCloudFetcher(id, url),
    heroku: (id, url) => new HerokuFetcher(id, url),
};

function feedReaderFor(feed: ProviderSource): Fetcher | null {
    const make = isFeedFamily(feed.family) ? FEED_READERS[feed.family] : undefined;
    return make ? make(feed.providerId, feed.url) : null;
}

/**
 * Lê um Provider pelas fontes ativas dele no catálogo.
 * Com Feed, lê o Feed; os Probes de Providers com Feed só rodam a partir do Ticket 12.
 * Sem Feed, roda os Probes e o resultado leva a marca de "só acesso".
 */
async function readProvider(providerId: string, sources: ProviderSource[]): Promise<StatusResult> {
    const feeds = sources.filter(s => s.kind === "feed");
    if (feeds.length === 0) {
        return readProbes(providerId, sources.filter(s => s.kind === "probe").map(s => s.url));
    }

    // Vários Feeds por Provider são do Ticket 12; até lá, só o primeiro é lido.
    const [feed, ...ignored] = feeds;
    if (ignored.length > 0) {
        console.warn(`${providerId}: Feeds a mais ignorados até o Ticket 12 (${ignored.map(f => f.id).join(", ")})`);
    }

    const reader = feedReaderFor(feed);
    if (!reader) {
        // Feed não lido: o Provider fica Unreachable e o Poll segue com os demais.
        console.error(`Feed ${feed.id} de ${providerId} não lido: a família "${feed.family}" não tem leitor no código`);
        return { providerId, status: "unreachable", incidents: [], responseTime: 0 };
    }
    return reader.fetchStatus();
}

/** Um Poll: lê o Provider Catalog no banco a cada rodada e cada Provider ativo pelas suas fontes ativas. */
export async function fetchAllStatuses(): Promise<StatusResult[]> {
    const [providers, sources] = await Promise.all([getActiveProviders(), getActiveSources()]);
    return Promise.all(providers.map(p => readProvider(p.id, sources.filter(s => s.providerId === p.id))));
}
