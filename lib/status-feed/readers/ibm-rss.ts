import type { FeedContent, FeedReader } from "../read-policy";
import type { PublishedIncident } from "../types";
import { feedDate } from "./feed-date";
import { declaredByActiveIncidents, problemPhase } from "./problem-state";
import { parseRssItems, type RssItem } from "./rss";

/**
 * O RSS não tem campo de fase: a IBM põe a fase no começo do título ("RESOLVED: ..."). Só as marcas conhecidas contam,
 * e só nessa posição; a palavra no meio do título ou do texto não diz nada. Lista e amostra em `ISSUES_ANNOTATION.md`, 1.2.
 */
const PHASE_MARK = /^(INVESTIGATING|IDENTIFIED|MITIGATING|MONITORING|RESOLVED|PLANNED|MAINTENANCE|COMPLETED|CANCELLED):\s*/;

/** Categorias que o Feed publica e que não são Incident. Uma categoria fora desta lista pode ser, então não é ignorada. */
const OTHER_CATEGORIES = ["announcement", "release_note", "security"];

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
    // Sem a fase: o título do mesmo Incident não muda entre as fases.
    const title = item.title.replace(PHASE_MARK, "");
    return {
        externalId: item.guid || title,
        title,
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
    if (item.category.every(category => OTHER_CATEGORIES.includes(category))) return [];
    throw new Error(`categoria desconhecida no Feed da IBM: ${item.category.join(", ")}`);
}

function toFeedContent(items: RssItem[], pollAt: Date): FeedContent {
    const incidents = items.flatMap(toIncidents);
    // O Feed não publica gravidade: todo problema aberto fica no padrão da regra, Degraded.
    return { declared: declaredByActiveIncidents(incidents, pollAt), incidents };
}

/**
 * Leitor do RSS da IBM. A classificação vem do Feed, em `category`: `incident` traz problemas e `maintenance` traz
 * manutenções. O `guid` é o id; sem ele, o título sem a fase.
 */
export const ibmRssReader: FeedReader = {
    read: ([body], _addresses, pollAt) => toFeedContent(parseRssItems(body), pollAt),
};
