import type { FeedContent, FeedReader } from "../read-policy";
import type { PublishedIncident } from "../types";
import { declaredByOpenProblems, problemPhase } from "./problem-state";
import { parseRssItems, type RssItem } from "./rss";

const RESOLVED = /\bresolved\b/i;

function toIncident(item: RssItem): PublishedIncident {
    const resolved = RESOLVED.test(item.title) || RESOLVED.test(item.description ?? "");

    return {
        kind: "problem",
        status: problemPhase(resolved),
        externalId: item.guid || item.title,
        title: item.title,
        description: item.description,
        url: item.link,
        createdAt: item.pubDate,
    };
}

function toFeedContent(items: RssItem[]): FeedContent {
    const incidents = items.map(toIncident);
    return { declared: declaredByOpenProblems(incidents), incidents };
}

/**
 * Leitor do RSS da Azure. Diferente da AWS, cada item é um evento, e o `guid` é um slug fixo dele, sem instante.
 * O Feed só lista o que está em andamento: fica vazio quando não há Incidents.
 */
export const azureRssReader: FeedReader = {
    read: ([body]) => toFeedContent(parseRssItems(body)),
};
