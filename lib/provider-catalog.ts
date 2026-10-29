/**
 * Provider Catalog (ADR 0001): os dados moram no banco e mudam só por migrations de dados.
 * O código conhece apenas as famílias de Feed, porque cada família tem o seu leitor.
 * Termos conforme GLOSSARY.md.
 */

/**
 * Famílias de Feed conhecidas pelo código: Statuspage.io, RSS da AWS, RSS da Azure, Google Cloud, Heroku,
 * Salesforce e RSS da IBM. RSS da AWS e da Azure ficam separados porque hoje têm leitores distintos.
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
