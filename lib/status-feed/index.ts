/**
 * Módulo de Status Feed: lê os Providers ativos pelas fontes ativas deles no Provider Catalog.
 * Toda busca de rede passa pela política de leitura (`read-policy.ts`); cada família só interpreta o conteúdo.
 */
import { getActiveProviders, getActiveSources } from "../dao";
import { isAccessOnly, isFeedFamily, sourcesByProvider, type FeedFamily } from "../provider-catalog";
import type { ProviderSource } from "../schema";
import { readFeed, readProbe, type FeedReader } from "./read-policy";
import { awsRssReader } from "./readers/aws-rss";
import { azureRssReader } from "./readers/azure-rss";
import { googleCloudReader } from "./readers/google-cloud";
import { herokuReader } from "./readers/heroku";
import { statuspageReader } from "./readers/statuspage";
import type { ReadIncident, StatusResult } from "./types";

/** Resultado de ler um Provider num Poll. */
type ProviderReading = StatusResult<ReadIncident>;

/**
 * Leitor de cada família de Feed. Salesforce e RSS da IBM ainda não têm leitor (Ticket 11):
 * um Feed ativo delas vira Feed não lido.
 */
const FEED_READERS: Partial<Record<FeedFamily, FeedReader>> = {
    statuspage: statuspageReader,
    "aws-rss": awsRssReader,
    "azure-rss": azureRssReader,
    "google-cloud": googleCloudReader,
    heroku: herokuReader,
};

function unreachableResult(providerId: string): ProviderReading {
    return { providerId, status: "unreachable", incidents: [] };
}

async function readFeedSource(feed: ProviderSource): Promise<ProviderReading> {
    const reader = isFeedFamily(feed.family) ? FEED_READERS[feed.family] : undefined;
    if (!reader) {
        // Feed não lido: o Provider fica Unreachable e o Poll segue com os demais.
        console.error(`Feed ${feed.id} de ${feed.providerId} não lido: a família "${feed.family}" não tem leitor no código`);
        return unreachableResult(feed.providerId);
    }

    const reading = await readFeed(feed, reader);
    if (!reading.read) return unreachableResult(feed.providerId);
    return { providerId: feed.providerId, status: reading.declared, incidents: reading.incidents };
}

/** Probes não declaram estado nem Incidents: de pé quando algum responde, Unreachable quando nenhum responde. */
async function readProbes(providerId: string, probes: ProviderSource[]): Promise<ProviderReading> {
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
async function readProvider(providerId: string, sources: ProviderSource[]): Promise<ProviderReading> {
    if (isAccessOnly(sources)) return readProbes(providerId, sources);

    // Vários Feeds por Provider são do Ticket 12; até lá, só o primeiro é lido.
    const [feed, ...ignored] = sources.filter(s => s.kind === "feed");
    if (ignored.length > 0) {
        console.warn(`${providerId}: Feeds a mais ignorados até o Ticket 12 (${ignored.map(f => f.id).join(", ")})`);
    }
    return readFeedSource(feed);
}

/** Um Poll: lê o Provider Catalog no banco a cada rodada e cada Provider ativo pelas suas fontes ativas. */
export async function fetchAllStatuses(): Promise<ProviderReading[]> {
    const [providers, sources] = await Promise.all([getActiveProviders(), getActiveSources()]);
    const byProvider = sourcesByProvider(sources);
    return Promise.all(providers.map(p => readProvider(p.id, byProvider.get(p.id) ?? [])));
}
