import type { FeedContent, FeedReader } from "../read-policy";
import type { PublishedIncident } from "../types";
import { declaredByActiveIncidents, problemPhase, type ProblemSeverity } from "./problem-state";
import { parseRssItems, type RssItem } from "./rss";

/** `guid` da AWS: `https://status.aws.amazon.com/#<evento>_<instante da atualização>`. */
const GUID = /#(.+)_\d+$/;

/**
 * O RSS não tem campo de fase: a AWS marca o fim no texto da última atualização. Títulos antigos trazem
 * "[RESOLVED]"; os atuais (fixture de 30/10/2026) fecham a descrição com "the service is operating normally".
 * A marca vale só na última frase: antes dela, o texto narra a recuperação de partes do evento.
 */
const RESOLVED_TITLE = /\bresolved\b/i;
const RESOLVED_CLOSING = /\bissues? (?:is|are|has been|have been) resolved\b|(?<!\bother )\bservices? (?:is|are)(?: now)? operating normally\b/i;

function eventOf(item: RssItem): string {
    const event = item.guid?.match(GUID)?.[1];
    if (!event) throw new Error(`guid fora do formato da AWS: ${item.guid}`);
    return event;
}

/** A última frase do texto, sem links nem marcação. */
function closingSentence(description: string): string {
    const text = description.replace(/<a\b[\s\S]*?<\/a>/gi, " ").replace(/<[^>]*>/g, " ").trim();
    return text.split(/(?<=[.!?])\s+/).at(-1) ?? "";
}

function isResolved(update: RssItem): boolean {
    return RESOLVED_TITLE.test(update.title) || RESOLVED_CLOSING.test(closingSentence(update.description ?? ""));
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
 * O título é sempre o da última atualização: é dele que sai a gravidade.
 */
function toIncident(externalId: string, updates: RssItem[]): PublishedIncident {
    const latest = updates[updates.length - 1];
    const previous = updates.slice(0, -1);
    const lastClosed = previous.map(isResolved).lastIndexOf(true);
    const resolved = isResolved(latest);

    return {
        kind: "problem",
        status: problemPhase(resolved),
        externalId,
        title: latest.title,
        description: latest.description,
        url: latest.link,
        createdAt: updates[lastClosed + 1].pubDate,
        updatedAt: latest.pubDate,
        resolvedAt: resolved ? latest.pubDate : undefined,
    };
}

/** Vale o que a AWS diz agora: um título que ela passe a usar fica Degraded até entrar aqui. */
function severityOf(problem: PublishedIncident): ProblemSeverity {
    return problem.title.startsWith("Service disruption") ? "outage" : "degraded";
}

function toFeedContent(items: RssItem[], pollAt: Date): FeedContent {
    const chronological = [...items].sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());
    const incidents = [...byEvent(chronological)].map(([event, updates]) => toIncident(event, updates));

    return { declared: declaredByActiveIncidents(incidents, pollAt, severityOf), incidents };
}

/**
 * Leitor do RSS da AWS. Cada atualização é um item, e o `guid` muda a cada uma: o Incident é o evento, a parte do
 * `guid` antes do instante. Não há encerramento por silêncio: o evento fica ativo até a AWS marcá-lo como resolvido.
 */
export const awsRssReader: FeedReader = {
    read: ([body], _addresses, pollAt) => toFeedContent(parseRssItems(body), pollAt),
};
