/**
 * Módulo de Status Feed: lê os Providers ativos pelas fontes ativas deles no Provider Catalog.
 * Toda busca de rede passa pela política de leitura (`read-policy.ts`), menos a dos leitores que ainda vivem em
 * lib/fetchers e que o Ticket 10 traz para cá.
 */
import { AWSFetcher } from "../fetchers/aws";
import { AzureFetcher } from "../fetchers/azure";
import { GoogleCloudFetcher } from "../fetchers/google";
import { HerokuFetcher } from "../fetchers/heroku";
import type { Fetcher, StatusResult } from "../fetchers/types";
import { getActiveProviders, getActiveSources } from "../dao";
import { isAccessOnly, isFeedFamily, sourcesByProvider, type FeedFamily } from "../provider-catalog";
import type { ProviderSource } from "../schema";
import { readFeed, readProbe, type FeedReader } from "./read-policy";
import { statuspageReader } from "./readers/statuspage";

/**
 * Leitor de cada família de Feed. Salesforce e RSS da IBM ainda não têm leitor (Ticket 11):
 * um Feed ativo delas vira Feed não lido.
 */
const FEED_READERS: Partial<Record<FeedFamily, FeedReader>> = {
    statuspage: statuspageReader,
};

/** Famílias ainda fora da política de leitura. Saem daqui, uma a uma, para `FEED_READERS` no Ticket 10. */
const LEGACY_READERS: Partial<Record<FeedFamily, (providerId: string, url: string) => Fetcher>> = {
    "aws-rss": (id, url) => new AWSFetcher(id, url),
    "azure-rss": (id, url) => new AzureFetcher(id, url),
    "google-cloud": (id, url) => new GoogleCloudFetcher(id, url),
    heroku: (id, url) => new HerokuFetcher(id, url),
};

function unread(providerId: string): StatusResult {
    return { providerId, status: "unreachable", incidents: [] };
}

async function readFeedSource(feed: ProviderSource): Promise<StatusResult> {
    const family = isFeedFamily(feed.family) ? feed.family : null;

    const reader = family && FEED_READERS[family];
    if (reader) {
        const reading = await readFeed(feed, reader);
        if (!reading.read) return unread(feed.providerId);
        return { providerId: feed.providerId, status: reading.declared, incidents: reading.incidents };
    }

    const legacy = family && LEGACY_READERS[family];
    if (legacy) return legacy(feed.providerId, feed.url).fetchStatus();

    // Feed não lido: o Provider fica Unreachable e o Poll segue com os demais.
    console.error(`Feed ${feed.id} de ${feed.providerId} não lido: a família "${feed.family}" não tem leitor no código`);
    return unread(feed.providerId);
}

/** Probes não declaram estado nem Incidents: de pé quando algum responde, Unreachable quando nenhum responde. */
async function readProbes(providerId: string, probes: ProviderSource[]): Promise<StatusResult> {
    const answers = await Promise.all(probes.map(readProbe));
    return {
        providerId,
        status: answers.some(Boolean) ? "operational" : "unreachable",
        incidents: [],
        accessOnly: true,
    };
}

/**
 * Lê um Provider pelas fontes ativas dele no catálogo.
 * Com Feed, lê o Feed; os Probes de Providers com Feed só rodam a partir do Ticket 12.
 * Sem Feed, roda os Probes e o resultado leva a marca de "só acesso".
 */
async function readProvider(providerId: string, sources: ProviderSource[]): Promise<StatusResult> {
    if (isAccessOnly(sources)) return readProbes(providerId, sources);

    // Vários Feeds por Provider são do Ticket 12; até lá, só o primeiro é lido.
    const [feed, ...ignored] = sources.filter(s => s.kind === "feed");
    if (ignored.length > 0) {
        console.warn(`${providerId}: Feeds a mais ignorados até o Ticket 12 (${ignored.map(f => f.id).join(", ")})`);
    }
    return readFeedSource(feed);
}

/** Um Poll: lê o Provider Catalog no banco a cada rodada e cada Provider ativo pelas suas fontes ativas. */
export async function fetchAllStatuses(): Promise<StatusResult[]> {
    const [providers, sources] = await Promise.all([getActiveProviders(), getActiveSources()]);
    const byProvider = sourcesByProvider(sources);
    return Promise.all(providers.map(p => readProvider(p.id, byProvider.get(p.id) ?? [])));
}
