/**
 * URLs de Feed dos testes dos leitores: as mesmas da carga do Provider Catalog
 * (`drizzle/0004_provider_catalog_load.sql`), que no código chegam pelo catálogo.
 */
export const FEED_URLS = {
    aws: 'https://status.aws.amazon.com/rss/all.rss',
    azure: 'https://azure.status.microsoft/en-us/status/feed/',
    googleCloud: 'https://status.cloud.google.com/incidents.json',
    heroku: 'https://status.heroku.com/api/v4/current-status',
    ibm: 'https://cloud.ibm.com/status/api/notifications/feed.rss',
    /** O Feed da Salesforce é a API `/v1`, lida em duas listas; a das manutenções leva a janela na query. */
    salesforceIncidents: 'https://api.status.salesforce.com/v1/incidents/active',
    salesforceMaintenances: 'https://api.status.salesforce.com/v1/maintenances',
} as const;
