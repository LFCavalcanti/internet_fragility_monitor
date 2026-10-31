/**
 * Provider Catalog (ADR 0001): os dados moram no banco e mudam só por migrations de dados.
 * O código conhece apenas as famílias de Feed, porque cada família tem o seu leitor.
 * Termos conforme GLOSSARY.md.
 */

/**
 * Famílias de Feed conhecidas pelo código: Statuspage.io, RSS da AWS, RSS da Azure, Google Cloud, Heroku,
 * Salesforce e RSS da IBM. RSS da AWS e da Azure são formatos diferentes: na AWS cada atualização é um item, e o
 * `guid` traz o evento e o instante; na Azure cada item é um evento, e o `guid` é um slug.
 */
export const FEED_FAMILIES = [
    "statuspage",
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
 * "Provider sem Feed": o Poll e a leitura do Snapshot a aplicam às fontes ativas do Provider, e o resto lê a marca.
 */
export function isAccessOnly(sources: readonly { kind: SourceKind }[]): boolean {
    return !sources.some(s => s.kind === "feed");
}

/** As fontes agrupadas por Provider, numa passada só. Provider sem fonte não aparece no mapa. */
export function sourcesByProvider<S extends { providerId: string }>(sources: readonly S[]): Map<string, S[]> {
    const grouped = new Map<string, S[]>();
    for (const source of sources) {
        const list = grouped.get(source.providerId);
        if (list) list.push(source);
        else grouped.set(source.providerId, [source]);
    }
    return grouped;
}
