// @vitest-environment node
/**
 * Leitura do Snapshot guiada pelo Provider Catalog, no banco real das migrations (SQLite em memória).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMigratedDb, type MigratedDb } from "../helpers/migrated-db";

let current: MigratedDb;
vi.mock("@/lib/db", () => ({ getDb: () => current.db }));

import { getLatestStatus } from "@/lib/db-service";

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
