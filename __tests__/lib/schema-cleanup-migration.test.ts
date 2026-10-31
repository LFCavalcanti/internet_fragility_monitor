// @vitest-environment node
/**
 * Migration que tira `response_time` de `status_checks` e `severity` de `incidents`, sobre um banco na `0007`, como a
 * produção chega ao deploy: as linhas, os índices, as chaves estrangeiras e os padrões têm de sobreviver.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMigratedDb, type MigratedDb } from "../helpers/migrated-db";
import { readSnapshot, recordPoll } from "@/lib/poll-recording";
import { decideProviderStatus } from "@/lib/provider-status";

let current: MigratedDb;

const at = new Date("2026-10-28T12:00:00Z");
const seconds = (d: Date) => Math.floor(d.getTime() / 1000);
const earlier = seconds(new Date("2026-10-28T11:55:00Z"));
const feeds = JSON.stringify([{ sourceId: "aws-feed", declared: "degraded" }]);

const rows = async (sql: string) => (await current.client.execute(sql)).rows.map(row => ({ ...row }));

const columnsOf = async (table: string) => (await rows(`PRAGMA table_info(${table})`)).map(c => c.name);

const defaultOf = async (table: string, column: string) =>
    (await rows(`PRAGMA table_info(${table})`)).find(c => c.name === column)?.dflt_value;

async function seedOldRows() {
    await current.client.batch([
        {
            sql: "INSERT INTO status_checks (id, provider_id, status, response_time, checked_at, no_source_answered, feeds) VALUES (?, ?, ?, ?, ?, ?, ?)",
            args: [7, "aws", "degraded", 120, earlier, 0, feeds],
        },
        {
            sql: "INSERT INTO status_checks (id, provider_id, status, response_time, checked_at, no_source_answered, feeds) VALUES (?, ?, ?, ?, ?, ?, ?)",
            args: [8, "azure", "unreachable", null, earlier, 1, null],
        },
        {
            sql: `INSERT INTO incidents (id, provider_id, source_id, external_id, title, description, status, kind, severity, url,
                scheduled_for, created_at, updated_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: ["known", "aws", "aws-feed", "abc", "Known", "Text", "scheduled", "maintenance", "major", "https://example.test/1",
                earlier + 60, earlier, earlier + 1, null],
        },
        {
            sql: "INSERT INTO incidents (id, provider_id, title, status, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?)",
            args: ["old", "aws", "Old", "resolved", earlier, earlier + 2],
        },
    ], "write");
}

beforeEach(async () => {
    current = await createMigratedDb({ upTo: "0007_provider_reading" });
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("migration que remove o tempo de resposta e a severidade", () => {
    it("as colunas saem", async () => {
        await current.migrateRest();

        expect(await columnsOf("status_checks")).toEqual(["id", "provider_id", "status", "checked_at", "no_source_answered", "feeds"]);
        expect(await columnsOf("incidents")).not.toContain("severity");
    });

    it("as leituras sobrevivem, com o id e todos os valores", async () => {
        await seedOldRows();

        await current.migrateRest();

        expect(await rows("SELECT * FROM status_checks ORDER BY id")).toEqual([
            { id: 7, provider_id: "aws", status: "degraded", checked_at: earlier, no_source_answered: 0, feeds },
            { id: 8, provider_id: "azure", status: "unreachable", checked_at: earlier, no_source_answered: 1, feeds: null },
        ]);
    });

    it("os Incidents sobrevivem, com todos os valores", async () => {
        await seedOldRows();

        await current.migrateRest();

        expect(await rows("SELECT * FROM incidents ORDER BY id")).toEqual([
            {
                id: "known", provider_id: "aws", source_id: "aws-feed", external_id: "abc", title: "Known", description: "Text",
                status: "scheduled", kind: "maintenance", url: "https://example.test/1", scheduled_for: earlier + 60,
                created_at: earlier, updated_at: earlier + 1, resolved_at: null,
            },
            expect.objectContaining({ id: "old", source_id: null, external_id: null, kind: "problem", resolved_at: earlier + 2 }),
        ]);
    });

    it("os índices continuam", async () => {
        await current.migrateRest();

        const indexes = (await rows("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")).map(r => r.name);
        expect(indexes).toEqual(expect.arrayContaining(["incidents_source_external_unique", "status_checks_provider_checked_at"]));
        expect((await rows("PRAGMA index_info(status_checks_provider_checked_at)")).map(c => c.name)).toEqual(["provider_id", "checked_at"]);
    });

    it("o par fonte e id publicado continua único, e as linhas sem fonte continuam a conviver", async () => {
        await seedOldRows();
        await current.migrateRest();

        await expect(current.client.execute(
            "INSERT INTO incidents (id, provider_id, source_id, external_id, title, status) VALUES ('dup', 'aws', 'aws-feed', 'abc', 'Dup', 'investigating')",
        )).rejects.toThrow(/UNIQUE/);
        await current.client.execute("INSERT INTO incidents (id, provider_id, title, status) VALUES ('old-2', 'aws', 'Old', 'investigating')");

        expect(await rows("SELECT id FROM incidents WHERE source_id IS NULL")).toHaveLength(2);
    });

    it("as chaves estrangeiras continuam", async () => {
        await current.migrateRest();

        expect((await rows("PRAGMA foreign_key_list(status_checks)")).map(k => [k.table, k.from, k.to])).toEqual([["providers", "provider_id", "id"]]);
        expect((await rows("PRAGMA foreign_key_list(incidents)")).map(k => [k.table, k.from, k.to]).sort()).toEqual([
            ["provider_sources", "source_id", "id"],
            ["providers", "provider_id", "id"],
        ]);
        await expect(current.client.execute("INSERT INTO status_checks (provider_id, status) VALUES ('no-such-provider', 'operational')"))
            .rejects.toThrow(/FOREIGN KEY/);
    });

    it("os padrões continuam", async () => {
        await current.migrateRest();

        expect(await defaultOf("status_checks", "no_source_answered")).toBe("false");
        expect(await defaultOf("status_checks", "checked_at")).toBe("CURRENT_TIMESTAMP");
        expect(await defaultOf("incidents", "kind")).toBe("'problem'");
        expect(await defaultOf("incidents", "created_at")).toBe("CURRENT_TIMESTAMP");
        expect(await defaultOf("incidents", "updated_at")).toBe("CURRENT_TIMESTAMP");
    });

    it("o id das leituras segue crescendo depois da migration", async () => {
        await seedOldRows();
        await current.migrateRest();

        await recordPoll(current.db, [{ providerId: "aws", accessOnly: false, probes: [], feeds: [{ sourceId: "aws-feed", read: true, declared: "operational", incidents: [] }] }], at);

        expect((await rows("SELECT max(id) AS id FROM status_checks"))[0].id).toBe(9);
    });

    it("a leitura gravada antes da migration continua a decidir o Snapshot", async () => {
        await seedOldRows();
        await current.migrateRest();

        const { reading } = (await readSnapshot(current.db, at)).providers.find(e => e.provider.id === "aws")!;

        expect(decideProviderStatus({ ...reading, now: at }).status).toBe("degraded");
    });
});
