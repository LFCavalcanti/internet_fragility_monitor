import type { FeedContent, FeedReader } from "../read-policy";
import type { PublishedIncident } from "../types";
import { feedDate } from "./feed-date";
import { declaredByOpenProblems, problemPhase } from "./problem-state";
import { parseRssItems, type RssItem } from "./rss";

/**
 * O RSS não tem campo de fase: a IBM põe a fase no começo do título ("RESOLVED: ..."). Só as marcas conhecidas contam,
 * e só nessa posição; a palavra no meio do título ou do texto não diz nada. Lista e amostra nos Comments do Ticket 11.
 */
const PHASE_MARK = /^(INVESTIGATING|IDENTIFIED|MITIGATING|MONITORING|RESOLVED|PLANNED|MAINTENANCE|COMPLETED|CANCELLED):\s*/;

function phaseOf(item: RssItem): string | undefined {
    return item.title.match(PHASE_MARK)?.[1];
}

/** O item gerado pela IBM termina num rodapé fixo, depois do último "Type:": `Outage Start`, `Outage End`, `Update Time`. */
function footerDate(item: RssItem, field: "Outage Start" | "Outage End" | "Update Time"): Date | undefined {
    const description = item.description ?? "";
    const footer = description.slice(description.lastIndexOf("Type:"));
    const value = footer.match(new RegExp(`${field}: ([^<]+?)\\s*<br`))?.[1];
    return value === undefined ? undefined : feedDate.parse(value);
}

function commonFields(item: RssItem) {
    if (!item.guid) throw new Error(`item da IBM sem guid: ${item.title}`);
    return {
        externalId: item.guid,
        // Sem a fase: o título do mesmo Incident não muda entre as fases.
        title: item.title.replace(PHASE_MARK, ""),
        description: item.description,
        url: item.link,
        createdAt: item.pubDate,
        updatedAt: footerDate(item, "Update Time"),
    };
}

/**
 * `Outage End` também encerra: na captura de 2020, um incidente seguia com o título INVESTIGATING semanas depois do fim
 * publicado no rodapé. Sem nenhuma das duas marcas, fica ativo: não há encerramento por silêncio.
 */
function toProblem(item: RssItem): PublishedIncident {
    const end = footerDate(item, "Outage End");
    return {
        ...commonFields(item),
        kind: "problem",
        status: problemPhase(end !== undefined || phaseOf(item) === "RESOLVED"),
        resolvedAt: end,
    };
}

/** No rodapé de uma manutenção, `Outage Start` e `Outage End` são a janela marcada. Cancelada não é lida. */
function toMaintenance(item: RssItem): PublishedIncident[] {
    const scheduled = { ...commonFields(item), kind: "maintenance", scheduledFor: footerDate(item, "Outage Start") } as const;
    switch (phaseOf(item)) {
        case "CANCELLED":
            return [];
        case "COMPLETED":
            return [{ ...scheduled, status: "completed", resolvedAt: footerDate(item, "Outage End") }];
        case "MAINTENANCE":
            return [{ ...scheduled, status: "in_progress" }];
        default:
            return [{ ...scheduled, status: "scheduled" }];
    }
}

function toIncidents(item: RssItem): PublishedIncident[] {
    if (item.category.length === 0) throw new Error(`item da IBM sem categoria: ${item.title}`);
    if (item.category.includes("incident")) return [toProblem(item)];
    if (item.category.includes("maintenance")) return toMaintenance(item);
    return [];
}

function toFeedContent(items: RssItem[]): FeedContent {
    const incidents = items.flatMap(toIncidents);
    return { declared: declaredByOpenProblems(incidents), incidents };
}

/**
 * Leitor do RSS da IBM. A classificação vem do Feed, em `category`: `incident` traz problemas e `maintenance` traz
 * manutenções. O resto (`announcement`, `release_note`, `security`) não é Incident. O `guid` é o id.
 */
export const ibmRssReader: FeedReader = {
    read: ([body]) => toFeedContent(parseRssItems(body)),
};
