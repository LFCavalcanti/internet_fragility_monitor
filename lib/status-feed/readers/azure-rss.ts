import type { FeedContent, FeedReader } from "../read-policy";
import type { PublishedIncident } from "../types";
import { declaredByActiveIncidents, problemPhase } from "./problem-state";
import { parseRssItems, type RssItem } from "./rss";

const RESOLVED = /\bresolved\b/i;
const ACTIVE_TITLE = /^active\b/i;

function toIncident(item: RssItem): PublishedIncident {
    // O título "Active - ..." já diz que segue aberto: "resolved" no texto não encerra o problema nem esconde a Outage.
    const resolved = !ACTIVE_TITLE.test(item.title) && (RESOLVED.test(item.title) || RESOLVED.test(item.description ?? ""));

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

function toFeedContent(items: RssItem[], pollAt: Date): FeedContent {
    const incidents = items.map(toIncident);
    return { declared: declaredByActiveIncidents(incidents, pollAt, () => "outage"), incidents };
}

/**
 * Leitor do RSS da Azure. Diferente da AWS, cada item é um evento, e o `guid` é um slug fixo dele, sem instante.
 * O Feed só lista o que está em andamento: fica vazio quando não há Incidents. Todo problema aberto é Outage: a
 * página pública só comunica problemas de impacto amplo ou casos em que o portal fica inacessível.
 */
export const azureRssReader: FeedReader = {
    read: ([body], _addresses, pollAt) => toFeedContent(parseRssItems(body), pollAt),
};
