/**
 * Módulo de Status Feed: lê os Providers ativos pelas fontes ativas deles no Provider Catalog e devolve, por Provider,
 * a leitura de cada Feed e o resultado de cada Probe. Quem decide o estado é o módulo de Provider Status.
 * Toda busca de rede passa pela política de leitura (`read-policy.ts`); cada família só interpreta o conteúdo.
 */
import type { ActiveCatalog } from "../poll-recording";
import { groupByProvider, isAccessOnly, isFeedFamily, type FeedFamily } from "../provider-catalog";
import type { FeedReading } from "../provider-status";
import type { ProviderSource } from "../schema";
import type { ProviderReading } from "./provider-reading";
import { readFeed, readProbe, type FeedReader } from "./read-policy";
import { awsRssReader } from "./readers/aws-rss";
import { azureRssReader } from "./readers/azure-rss";
import { googleCloudReader } from "./readers/google-cloud";
import { herokuReader } from "./readers/heroku";
import { ibmRssReader } from "./readers/ibm-rss";
import { salesforceReader } from "./readers/salesforce";
import { statuspageReader } from "./readers/statuspage";
import type { ReadIncident } from "./types";

/** Leitor de cada família de Feed. */
const FEED_READERS: Record<FeedFamily, FeedReader> = {
    statuspage: statuspageReader,
    "aws-rss": awsRssReader,
    "azure-rss": azureRssReader,
    "google-cloud": googleCloudReader,
    heroku: herokuReader,
    salesforce: salesforceReader,
    "ibm-rss": ibmRssReader,
};

async function readFeedSource(feed: ProviderSource): Promise<FeedReading<ReadIncident>> {
    const reader = isFeedFamily(feed.family) ? FEED_READERS[feed.family] : undefined;
    if (!reader) {
        // Feed não lido, sem ir à rede: o Poll segue com os demais.
        console.error(`Feed ${feed.id} de ${feed.providerId} não lido: a família "${feed.family}" não tem leitor no código`);
        return { read: false, answered: false };
    }
    return readFeed(feed, reader);
}

/** Lê um Provider por todas as fontes ativas dele, ao mesmo tempo: cada uma tem o próprio timeout. */
async function readProvider(providerId: string, sources: ProviderSource[]): Promise<ProviderReading<ReadIncident>> {
    const [feeds, probes] = await Promise.all([
        Promise.all(sources.filter(s => s.kind === "feed").map(readFeedSource)),
        Promise.all(sources.filter(s => s.kind === "probe").map(readProbe)),
    ]);
    return { providerId, accessOnly: isAccessOnly(sources), feeds, probes };
}

/** A leitura de um Poll: cada Provider ativo do catálogo, pelas suas fontes ativas. */
export async function readAllProviders({ providers, sources }: ActiveCatalog): Promise<ProviderReading<ReadIncident>[]> {
    const byProvider = groupByProvider(sources);
    return Promise.all(providers.map(p => readProvider(p.id, byProvider.get(p.id) ?? [])));
}
