// @vitest-environment node
/**
 * Leitura do Snapshot guiada pelo Provider Catalog, no banco real das migrations (SQLite em memória).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMigratedDb, type MigratedDb } from "../helpers/migrated-db";

let current: MigratedDb;
vi.mock("@/lib/db", () => ({ getDb: () => current.db }));

import { getLatestStatus } from "@/lib/db-service";
import { toProviderStatusInput } from "@/lib/snapshot-reading";
import { decideProviderStatus } from "@/lib/provider-status";

const now = new Date("2026-10-28T12:00:00Z");

describe("getLatestStatus lê o Provider Catalog", () => {
    beforeEach(async () => {
        current = await createMigratedDb();
    });

    it("traz os 13 Providers ativos na ordem de exibição, com nome, logo, status page e marcação de Major Provider", async () => {
        const snapshot = await getLatestStatus(now);

        expect(snapshot.map(e => e.provider.id)).toEqual([
            "aws", "google-cloud", "azure", "cloudflare", "vercel", "github", "jira",
            "ibm-cloud", "digital-ocean", "salesforce", "oracle-cloud", "hostinger", "heroku",
        ]);
        expect(snapshot[0].provider).toMatchObject({
            name: "AWS",
            logo: "https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg",
            statusPageUrl: "https://health.aws.amazon.com/health/status",
            isMajor: true,
        });
        expect(snapshot.find(e => e.provider.id === "heroku")?.provider.isMajor).toBe(false);
    });

    it("um Provider inativo some do Snapshot, mas o histórico dele continua no banco", async () => {
        await current.client.execute("INSERT INTO status_checks (provider_id, status) VALUES ('vercel', 'degraded')");
        // Como uma migration de catálogo faria.
        await current.client.execute("UPDATE providers SET active = 0 WHERE id = 'vercel'");

        const snapshot = await getLatestStatus(now);

        expect(snapshot.map(e => e.provider.id)).not.toContain("vercel");
        expect(snapshot).toHaveLength(12);
        const kept = await current.client.execute("SELECT count(*) AS n FROM status_checks WHERE provider_id = 'vercel'");
        expect(kept.rows[0].n).toBe(1);
    });

    it("segue a ordem de exibição do catálogo, não a de inserção", async () => {
        await current.client.execute("UPDATE providers SET display_order = 0 WHERE id = 'heroku'");

        const snapshot = await getLatestStatus(now);

        expect(snapshot[0].provider.id).toBe("heroku");
    });

    it("traz a leitura mais recente de cada Provider junto com ele", async () => {
        await current.client.execute({
            sql: "INSERT INTO status_checks (provider_id, status, checked_at) VALUES ('cloudflare', 'degraded', ?)",
            args: [Math.floor(now.getTime() / 1000) - 60],
        });

        const snapshot = await getLatestStatus(now);

        const cloudflare = snapshot.find(e => e.provider.id === "cloudflare");
        expect(cloudflare?.result).toMatchObject({ providerId: "cloudflare", status: "degraded" });
    });
});

describe("Snapshot de Provider só com Probes vai ao módulo de Provider Status", () => {
    beforeEach(async () => {
        current = await createMigratedDb();
    });

    const checkedAgo = (providerId: string, status: string) =>
        current.client.execute({
            sql: "INSERT INTO status_checks (provider_id, status, checked_at) VALUES (?, ?, ?)",
            args: [providerId, status, Math.floor(now.getTime() / 1000) - 60],
        });

    async function decisionFor(providerId: string) {
        const snapshot = await getLatestStatus(now);
        const entry = snapshot.find(e => e.provider.id === providerId)!;
        return decideProviderStatus(toProviderStatusInput(entry, now));
    }

    it("Oracle, Salesforce e IBM, sem Feed ativo, ficam Operational com a marca de \"só acesso\" quando um Probe respondeu", async () => {
        for (const id of ["oracle-cloud", "salesforce", "ibm-cloud"]) {
            await checkedAgo(id, "operational");
            expect(await decisionFor(id)).toMatchObject({ status: "operational", accessOnly: true });
        }
    });

    it("sem resposta de nenhum Probe, o Provider só com Probes fica Unreachable", async () => {
        await checkedAgo("oracle-cloud", "unreachable");

        expect(await decisionFor("oracle-cloud")).toMatchObject({ status: "unreachable", accessOnly: true });
    });

    it.each(["degraded", "outage"])(
        "um Provider só com Probes nunca aparece em %s, mesmo com uma leitura antiga dessas gravada",
        async status => {
            await checkedAgo("salesforce", status);

            expect(await decisionFor("salesforce")).toMatchObject({ status: "operational", accessOnly: true });
        },
    );

    it("um Provider só com Probes nunca aparece em Maintenance, mesmo com manutenção em andamento gravada", async () => {
        await checkedAgo("ibm-cloud", "operational");
        await current.client.execute(
            "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES ('m-1', 'ibm-cloud', 'Old maintenance', 'in_progress', 'maintenance')",
        );

        expect((await decisionFor("ibm-cloud")).status).toBe("operational");
    });

    it("um Provider com Feed ativo continua decidido pelo Feed, sem a marca", async () => {
        await checkedAgo("cloudflare", "degraded");

        expect(await decisionFor("cloudflare")).toMatchObject({ status: "degraded", accessOnly: false });
    });

    it("um Feed com falha de leitura vai como não lido, com os Incidents gravados", async () => {
        await checkedAgo("cloudflare", "unreachable");

        expect(await decisionFor("cloudflare")).toMatchObject({ status: "unreachable", accessOnly: false });
    });

    it("quando o Feed de um Provider é desativado, ele passa a ser um Provider só com Probes", async () => {
        await checkedAgo("heroku", "operational");
        await current.client.execute("UPDATE provider_sources SET active = 0 WHERE id = 'heroku-feed'");

        expect(await decisionFor("heroku")).toMatchObject({ status: "operational", accessOnly: true });
    });
});
