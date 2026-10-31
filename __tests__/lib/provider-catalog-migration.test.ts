// @vitest-environment node
/**
 * Migration de carga do Provider Catalog (spec-provider-catalog.md, decisão Q33):
 * as migrations reais aplicadas num SQLite em memória, conferindo o que ficou gravado.
 */
import { describe, it, expect } from "vitest";
import { asc, eq } from "drizzle-orm";
import { createMigratedDb } from "../helpers/migrated-db";
import { incidents, providers, providerSources, statusChecks } from "@/lib/schema";
import { FEED_FAMILIES, isFeedFamily } from "@/lib/provider-catalog";

/** A tabela "Carga inicial do catálogo" da spec, na ordem de exibição. */
const CATALOG = [
    { id: "aws", name: "AWS", major: true, feed: { family: "aws-rss", url: "https://status.aws.amazon.com/rss/all.rss", active: true }, probes: ["https://health.aws.amazon.com/health/status", "https://console.aws.amazon.com"] },
    { id: "google-cloud", name: "Google Cloud", major: true, feed: { family: "google-cloud", url: "https://status.cloud.google.com/incidents.json", active: true }, probes: ["https://status.cloud.google.com", "https://console.cloud.google.com"] },
    { id: "azure", name: "Azure", major: true, feed: { family: "azure-rss", url: "https://azure.status.microsoft/en-us/status/feed/", active: true }, probes: ["https://azure.status.microsoft/en-us/status", "https://portal.azure.com"] },
    { id: "cloudflare", name: "Cloudflare", major: true, feed: { family: "statuspage", url: "https://www.cloudflarestatus.com", active: true }, probes: ["https://www.cloudflarestatus.com", "https://dash.cloudflare.com"] },
    { id: "vercel", name: "Vercel", major: false, feed: { family: "statuspage", url: "https://www.vercel-status.com", active: true }, probes: ["https://www.vercel-status.com", "https://vercel.com/login"] },
    { id: "github", name: "GitHub", major: false, feed: { family: "statuspage", url: "https://www.githubstatus.com", active: true }, probes: ["https://www.githubstatus.com", "https://github.com/login"] },
    { id: "jira", name: "Jira", major: false, feed: { family: "statuspage", url: "https://jira-software.status.atlassian.com", active: true }, probes: ["https://jira-software.status.atlassian.com", "https://id.atlassian.com/login"] },
    { id: "ibm-cloud", name: "IBM Cloud", major: false, feed: { family: "ibm-rss", url: "https://cloud.ibm.com/status/api/notifications/feed.rss", active: true }, probes: ["https://cloud.ibm.com/status", "https://cloud.ibm.com/login"] },
    { id: "digital-ocean", name: "DigitalOcean", major: false, feed: { family: "statuspage", url: "https://status.digitalocean.com", active: true }, probes: ["https://status.digitalocean.com", "https://cloud.digitalocean.com/login"] },
    { id: "salesforce", name: "Salesforce", major: false, feed: { family: "salesforce", url: "https://api.status.salesforce.com/v1", active: true }, probes: ["https://status.salesforce.com", "https://login.salesforce.com"] },
    { id: "oracle-cloud", name: "Oracle Cloud", major: false, feed: null, probes: ["https://ocistatus.oraclecloud.com", "https://www.oracle.com/cloud/sign-in.html"] },
    { id: "hostinger", name: "Hostinger", major: false, feed: { family: "statuspage", url: "https://statuspage.hostinger.com", active: true }, probes: ["https://statuspage.hostinger.com", "https://hpanel.hostinger.com"] },
    { id: "heroku", name: "Heroku", major: false, feed: { family: "heroku", url: "https://status.heroku.com/api/v4/current-status", active: true }, probes: ["https://status.heroku.com", "https://id.heroku.com/login"] },
];

describe("migration de carga do Provider Catalog", () => {
    it("grava os 13 Providers ativos, na ordem de exibição da spec", async () => {
        const { db } = await createMigratedDb();

        const rows = await db.select().from(providers).orderBy(asc(providers.displayOrder)).all();

        expect(rows.map(p => [p.id, p.name])).toEqual(CATALOG.map(p => [p.id, p.name]));
        expect(rows.every(p => p.active)).toBe(true);
        expect(new Set(rows.map(p => p.displayOrder)).size).toBe(13);
    });

    it("marca só AWS, Google Cloud, Azure e Cloudflare como Major Providers", async () => {
        const { db } = await createMigratedDb();

        const majors = await db.select().from(providers).where(eq(providers.isMajor, true)).orderBy(asc(providers.displayOrder)).all();

        expect(majors.map(p => p.id)).toEqual(["aws", "google-cloud", "azure", "cloudflare"]);
    });

    it("mantém nome, site, tipo, logo e status page da lista de metadados que existia no código", async () => {
        const { db } = await createMigratedDb();

        const aws = await db.select().from(providers).where(eq(providers.id, "aws")).get();
        const oracle = await db.select().from(providers).where(eq(providers.id, "oracle-cloud")).get();

        expect(aws).toMatchObject({
            url: "https://aws.amazon.com",
            statusPageUrl: "https://health.aws.amazon.com/health/status",
            type: "cloud",
            logo: "https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg",
        });
        expect(oracle).toMatchObject({
            url: "https://www.oracle.com/cloud/",
            statusPageUrl: "https://ocistatus.oraclecloud.com",
            type: "cloud",
            logo: "https://upload.wikimedia.org/wikipedia/commons/5/50/Oracle_logo.svg",
        });
    });

    it("deixa os Feeds de cada Provider com família e URL, todos ativos depois da 0005", async () => {
        const { db } = await createMigratedDb();

        const feeds = await db.select().from(providerSources).where(eq(providerSources.kind, "feed")).all();

        const expected = CATALOG.filter(p => p.feed).map(p => ({ providerId: p.id, ...p.feed }));
        expect(feeds.map(f => ({ providerId: f.providerId, family: f.family, url: f.url, active: f.active })))
            .toEqual(expect.arrayContaining(expected.map(e => expect.objectContaining(e))));
        expect(feeds).toHaveLength(12);
        expect(feeds.every(f => f.active)).toBe(true);
    });

    it("a carga deixa só os Feeds de Salesforce e IBM inativos, e a 0005 ativa os dois sem mexer no resto", async () => {
        const { db, migrateRest } = await createMigratedDb({ upTo: "0004_provider_catalog_load" });
        const sources = () => db.select().from(providerSources).all();
        const before = await sources();
        expect(before.filter(s => !s.active).map(s => s.id).sort()).toEqual(["ibm-cloud-feed", "salesforce-feed"]);

        await migrateRest();

        const after = await sources();
        expect(after.filter(s => !s.active)).toEqual([]);
        const asActive = before.map(s => ({ ...s, active: true }));
        expect(after).toEqual(expect.arrayContaining(asActive));
        expect(after).toHaveLength(before.length);
    });

    it("na 0005, um Feed que foi desativado por outro motivo continua fora: só os dois Feeds mudam", async () => {
        const { client, db, migrateRest } = await createMigratedDb({ upTo: "0004_provider_catalog_load" });
        await client.execute("UPDATE provider_sources SET active = 0 WHERE id = 'heroku-feed'");

        await migrateRest();

        const inactive = await db.select().from(providerSources).where(eq(providerSources.active, false)).all();
        expect(inactive.map(s => s.id)).toEqual(["heroku-feed"]);
    });

    it("o site do GitHub passa a ser o GitHub: a status page e o resto do catálogo não mudam", async () => {
        const { db, migrateRest } = await createMigratedDb({ upTo: "0008_remove_response_time_severity" });
        const catalog = () => db.select().from(providers).orderBy(asc(providers.displayOrder)).all();
        const sources = () => db.select().from(providerSources).orderBy(asc(providerSources.id)).all();
        const [providersBefore, sourcesBefore] = [await catalog(), await sources()];
        expect(providersBefore.find(p => p.id === "github")?.url).toBe("https://githubstatus.com");

        await migrateRest();

        const github = (await catalog()).find(p => p.id === "github");
        expect(github).toMatchObject({ url: "https://github.com", statusPageUrl: "https://www.githubstatus.com" });
        expect(await catalog()).toEqual(providersBefore.map(p => (p.id === "github" ? { ...p, url: "https://github.com" } : p)));
        expect(await sources()).toEqual(sourcesBefore);
    });

    it("usa só famílias de Feed conhecidas pelo código", async () => {
        const { db } = await createMigratedDb();

        const feeds = await db.select().from(providerSources).where(eq(providerSources.kind, "feed")).all();

        expect([...FEED_FAMILIES].sort()).toEqual(
            ["aws-rss", "azure-rss", "google-cloud", "heroku", "ibm-rss", "salesforce", "statuspage"],
        );
        for (const f of feeds) expect(isFeedFamily(f.family)).toBe(true);
    });

    it("grava dois Probes ativos por Provider, status page e login, sem família", async () => {
        const { db } = await createMigratedDb();

        const probes = await db.select().from(providerSources).where(eq(providerSources.kind, "probe")).all();

        expect(probes).toHaveLength(26);
        for (const p of CATALOG) {
            const own = probes.filter(s => s.providerId === p.id);
            expect(own.map(s => [s.label, s.url])).toEqual(
                expect.arrayContaining([["status page", p.probes[0]], ["login", p.probes[1]]]),
            );
            expect(own.every(s => s.active && s.family === null)).toBe(true);
        }
    });

    it("num banco com os 13 Providers no formato antigo, preserva os ids, o Incident e a leitura ligados a eles", async () => {
        const { client, db, migrateRest } = await createMigratedDb({ upTo: "0002_maintenance_incidents_to_kind" });
        // Formato antigo: o que o Poll gravava a cada rodada, sem status page, marcação ou ordem.
        for (const p of CATALOG) {
            await client.execute({
                sql: "INSERT INTO providers (id, name, url, type, logo) VALUES (?, ?, ?, ?, ?)",
                args: [p.id, `${p.name} antigo`, "https://old.example", "other", null],
            });
        }
        await client.execute(
            "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES ('inc-1', 'heroku', 'API errors', 'investigating', 'problem')",
        );
        await client.execute("INSERT INTO status_checks (provider_id, status) VALUES ('heroku', 'degraded')");

        await migrateRest();

        const rows = await db.select().from(providers).orderBy(asc(providers.displayOrder)).all();
        expect(rows.map(p => [p.id, p.name])).toEqual(CATALOG.map(p => [p.id, p.name]));
        expect(rows.find(p => p.id === "heroku")).toMatchObject({
            url: "https://www.heroku.com",
            type: "paas",
            logo: "https://cdn.simpleicons.org/heroku/FFA94D",
            statusPageUrl: "https://status.heroku.com",
            active: true,
        });
        expect(await db.select().from(incidents).all()).toEqual([
            expect.objectContaining({ id: "inc-1", providerId: "heroku", title: "API errors", status: "investigating" }),
        ]);
        expect(await db.select().from(statusChecks).all()).toEqual([
            expect.objectContaining({ providerId: "heroku", status: "degraded" }),
        ]);
        expect(await db.select().from(providerSources).all()).toHaveLength(38);
    });
});
