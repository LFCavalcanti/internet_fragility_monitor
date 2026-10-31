import { isClosed } from "../../incident-status";
import type { FeedContent, FeedReader, PublishedIncident } from "../read-policy";
import { parseRssItems, type RssItem } from "./rss";

/** `guid` da AWS: `https://status.aws.amazon.com/#<evento>_<instante da atualização>`. */
const GUID = /#(.+)_\d+$/;

/**
 * O RSS não tem campo de fase: a AWS marca o fim no texto da última atualização. Títulos antigos trazem
 * "[RESOLVED]"; os atuais (fixture de 30/10/2026) terminam a descrição com "the service is operating normally".
 */
const RESOLVED_TITLE = /\bresolved\b/i;
const RESOLVED_DESCRIPTION = /\bservices? (?:is|are) operating normally\.?\s*$/i;

function eventOf(item: RssItem): string {
    const event = item.guid?.match(GUID)?.[1];
    if (!event) throw new Error(`guid fora do formato da AWS: ${item.guid}`);
    return event;
}

function isResolved(update: RssItem): boolean {
    return RESOLVED_TITLE.test(update.title) || RESOLVED_DESCRIPTION.test(update.description ?? "");
}

function byEvent(items: RssItem[]): Map<string, RssItem[]> {
    const events = new Map<string, RssItem[]>();
    for (const item of items) {
        const event = eventOf(item);
        events.set(event, [...(events.get(event) ?? []), item]);
    }
    return events;
}

/**
 * Um evento como um Incident, a partir das atualizações dele em ordem cronológica. O evento é serviço e região:
 * o que veio antes de um resolvido anterior é outra ocorrência, já encerrada, e não conta para a data de início.
 */
function toIncident(externalId: string, updates: RssItem[]): PublishedIncident {
    const latest = updates[updates.length - 1];
    const previous = updates.slice(0, -1);
    const lastClosed = previous.map(isResolved).lastIndexOf(true);
    const resolved = isResolved(latest);

    return {
        kind: "problem",
        status: resolved ? "resolved" : "investigating",
        externalId,
        title: latest.title,
        description: latest.description,
        url: latest.link,
        createdAt: updates[lastClosed + 1].pubDate,
        updatedAt: latest.pubDate,
        resolvedAt: resolved ? latest.pubDate : undefined,
    };
}

function toFeedContent(items: RssItem[]): FeedContent {
    const chronological = [...items].sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());
    const incidents = [...byEvent(chronological)].map(([event, updates]) => toIncident(event, updates));

    return { declared: incidents.some(i => !isClosed(i)) ? "degraded" : "operational", incidents };
}

/**
 * Leitor do RSS da AWS. Cada atualização é um item, e o `guid` muda a cada uma: o Incident é o evento, a parte do
 * `guid` antes do instante. Não há encerramento por silêncio: o evento fica ativo até a AWS marcá-lo como resolvido.
 */
export const awsRssReader: FeedReader = {
    read: body => toFeedContent(parseRssItems(body)),
};
