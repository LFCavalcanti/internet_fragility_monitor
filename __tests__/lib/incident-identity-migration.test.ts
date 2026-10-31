// @vitest-environment node
/**
 * Migration da identidade do Incident sobre um banco no formato antigo, como a produção chega ao deploy:
 * as linhas existentes não têm fonte nem id até o primeiro Poll depois dele.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMigratedDb, type MigratedDb } from "../helpers/migrated-db";
import { recordPoll } from "@/lib/poll-recording";

let current: MigratedDb;

const at = new Date("2026-10-28T12:00:00Z");

const insertOldRow = (id: string, title: string) =>
    current.client.execute({
        sql: "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES (?, 'cloudflare', ?, 'investigating', 'problem')",
        args: [id, title],
    });

const setIdentity = (id: string, sourceId: string, externalId: string) =>
    current.client.execute({
        sql: "UPDATE incidents SET source_id = ?, external_id = ? WHERE id = ?",
        args: [sourceId, externalId, id],
    });

beforeEach(async () => {
    current = await createMigratedDb({ upTo: "0005_activate_salesforce_ibm_feeds" });
    await insertOldRow("old-1", "Network issue");
    await insertOldRow("old-2", "Network issue");
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("migration da identidade do Incident", () => {
    it("as linhas antigas, inclusive as de título repetido, sobrevivem sem fonte e sem id", async () => {
        await current.migrateRest();

        const rows = await current.client.execute("SELECT id, title, source_id, external_id FROM incidents ORDER BY id");

        expect(rows.rows.map(r => [r.id, r.title, r.source_id, r.external_id])).toEqual([
            ["old-1", "Network issue", null, null],
            ["old-2", "Network issue", null, null],
        ]);
    });

    it("várias linhas sem fonte e sem id convivem: a unicidade do par não as alcança", async () => {
        await current.migrateRest();

        await expect(insertOldRow("old-3", "Network issue")).resolves.toBeDefined();
    });

    it("o par fonte e id é único", async () => {
        await current.migrateRest();
        await setIdentity("old-1", "cloudflare-feed", "abc");

        await expect(setIdentity("old-2", "cloudflare-feed", "abc")).rejects.toThrow(/UNIQUE/);
    });

    it("o mesmo id em outro Feed é outro Incident", async () => {
        await current.migrateRest();
        await setIdentity("old-1", "cloudflare-feed", "abc");

        await expect(setIdentity("old-2", "aws-feed", "abc")).resolves.toBeDefined();
    });

    it("o primeiro Poll depois do deploy dá identidade à linha aberta e resolve a duplicata", async () => {
        await current.migrateRest();

        await recordPoll(current.db, [{
            providerId: "cloudflare", accessOnly: false, probes: [],
            feeds: [{
                sourceId: "cloudflare-feed", read: true, declared: "degraded",
                incidents: [{
                    sourceId: "cloudflare-feed", externalId: "abc", kind: "problem", status: "identified",
                    title: "Network issue", createdAt: at,
                }],
            }],
        }], at);

        const rows = await current.client.execute("SELECT status, source_id, external_id FROM incidents ORDER BY status");
        expect(rows.rows.map(r => [r.status, r.source_id, r.external_id])).toEqual([
            ["identified", "cloudflare-feed", "abc"],
            ["resolved", null, null],
        ]);
    });
});
