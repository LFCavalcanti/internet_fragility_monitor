/**
 * Provider Catalog (ADR 0001): os dados moram no banco e mudam só por migrations de dados.
 * O código conhece apenas as famílias de Feed, porque cada família tem o seu leitor.
 * Termos conforme GLOSSARY.md.
 */

/**
 * Famílias de Feed conhecidas pelo código: Statuspage.io, Cloudflare, RSS da AWS, RSS da Azure, Google Cloud, Heroku,
 * Salesforce e RSS da IBM. A Cloudflare publica no formato da Statuspage.io, mas o estado dela vem dos Core Services.
 * RSS da AWS e da Azure são formatos diferentes: na AWS cada atualização é um item, e o `guid` traz o evento e o
 * instante; na Azure cada item é um evento, e o `guid` é um slug.
 */
export const FEED_FAMILIES = [
    "statuspage",
    "cloudflare",
    "aws-rss",
    "azure-rss",
    "google-cloud",
    "heroku",
    "salesforce",
    "ibm-rss",
] as const;

export type FeedFamily = (typeof FEED_FAMILIES)[number];

/** Uma família gravada no catálogo que o código não conhece resulta em Feed não lido (Ticket 08). */
export function isFeedFamily(family: string | null): family is FeedFamily {
    return family !== null && (FEED_FAMILIES as readonly string[]).includes(family);
}

/** Tipo de um Provider Source: um Feed, que declara estado e Incidents, ou um Probe, que só verifica acesso. */
export type SourceKind = "feed" | "probe";

/**
 * Marca de "só acesso": o Provider não tem Feed ativo e é lido só por Probes. É a única regra de
 * "Provider sem Feed": o Poll a aplica às fontes ativas do Provider e grava os Feeds lidos, de onde a leitura do
 * Snapshot tira a marca.
 */
export function isAccessOnly(sources: readonly { kind: SourceKind }[]): boolean {
    return !sources.some(s => s.kind === "feed");
}

/** Linhas agrupadas por Provider, numa passada só, na ordem recebida. Provider sem linha não aparece no mapa. */
export function groupByProvider<R extends { providerId: string }>(rows: readonly R[]): Map<string, R[]> {
    const grouped = new Map<string, R[]>();
    for (const row of rows) {
        const list = grouped.get(row.providerId);
        if (list) list.push(row);
        else grouped.set(row.providerId, [row]);
    }
    return grouped;
}
