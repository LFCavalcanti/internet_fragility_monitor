import { isClosed } from "../../incident-status";
import type { FeedContent, FeedReader, PublishedIncident } from "../read-policy";
import { parseRssItems, type RssItem } from "./rss";

const RESOLVED = /\bresolved\b/i;

function toIncident(item: RssItem): PublishedIncident {
    const resolved = RESOLVED.test(item.title) || RESOLVED.test(item.description ?? "");

    return {
        kind: "problem",
        status: resolved ? "resolved" : "investigating",
        externalId: item.guid || item.title,
        title: item.title,
        description: item.description,
        url: item.link,
        createdAt: item.pubDate,
    };
}

function toFeedContent(items: RssItem[]): FeedContent {
    const incidents = items.map(toIncident);
    return { declared: incidents.some(i => !isClosed(i)) ? "degraded" : "operational", incidents };
}

/**
 * Leitor do RSS da Azure. Diferente da AWS, cada item é um evento, e o `guid` é um slug fixo dele, sem instante.
 * O Feed só lista o que está em andamento: fica vazio quando não há Incidents.
 */
export const azureRssReader: FeedReader = {
    read: body => toFeedContent(parseRssItems(body)),
};
