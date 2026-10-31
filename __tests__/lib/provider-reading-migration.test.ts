// @vitest-environment node
/**
 * Migration da leitura por Provider sobre um banco no formato antigo, como a produção chega ao deploy: as linhas
 * existentes são uma por Feed e não dizem se a fonte respondeu. "unreachable" ali pode ser só um Feed não lido, com
 * Probes de pé, porque esses Probes não eram gravados: nada disso pode virar Down.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMigratedDb, type MigratedDb } from "../helpers/migrated-db";
import { readSnapshot, recordPoll } from "@/lib/poll-recording";
import { decideProviderStatus } from "@/lib/provider-status";
import type { ProviderReading } from "@/lib/status-feed/provider-reading";
import type { ReadIncident } from "@/lib/status-feed/types";

let current: MigratedDb;

const seconds = (d: Date) => Math.floor(d.getTime() / 1000);
const oldest = new Date("2026-10-28T11:50:00Z");
const earlier = new Date("2026-10-28T11:55:00Z");
const at = new Date("2026-10-28T12:00:00Z");
const later = new Date("2026-10-28T12:05:00Z");

const insertOldCheck = (providerId: string, status: string, checkedAt: Date) =>
    current.client.execute({
        sql: "INSERT INTO status_checks (provider_id, status, checked_at) VALUES (?, ?, ?)",
        args: [providerId, status, seconds(checkedAt)],
    });

const silent = (providerId: string): ProviderReading<ReadIncident> => ({
    providerId, accessOnly: false, feeds: [{ sourceId: `${providerId}-feed`, read: false, answered: false }], probes: [false, false],
});

async function decisionOf(providerId: string, now: Date) {
    const { reading } = (await readSnapshot(current.db, now)).providers.find(e => e.provider.id === providerId)!;
    return decideProviderStatus({ ...reading, now });
}

beforeEach(async () => {
    current = await createMigratedDb({ upTo: "0006_incident_identity" });
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("migration da leitura por Provider", () => {
    it("as linhas antigas sobrevivem, marcadas como se alguma fonte tivesse respondido, e sem Feeds", async () => {
        await insertOldCheck("aws", "unreachable", earlier);

        await current.migrateRest();

        const rows = await current.client.execute("SELECT status, no_source_answered, feeds FROM status_checks");
        expect(rows.rows.map(r => [r.status, r.no_source_answered, r.feeds])).toEqual([["unreachable", 0, null]]);
    });

    it("duas linhas antigas unreachable seguidas não produzem Down", async () => {
        await insertOldCheck("aws", "unreachable", oldest);
        await insertOldCheck("aws", "unreachable", earlier);

        await current.migrateRest();

        expect(await decisionOf("aws", earlier)).toMatchObject({ status: "unreachable", accessOnly: false });
    });

    it("duas linhas antigas unreachable de um Provider só com Probes não produzem Down", async () => {
        await insertOldCheck("oracle-cloud", "unreachable", oldest);
        await insertOldCheck("oracle-cloud", "unreachable", earlier);

        await current.migrateRest();

        expect(await decisionOf("oracle-cloud", earlier)).toMatchObject({ status: "unreachable", accessOnly: true });
    });

    it("o primeiro Poll sem resposta depois do deploy é Unreachable, mesmo depois de uma linha antiga unreachable", async () => {
        await insertOldCheck("aws", "unreachable", earlier);
        await current.migrateRest();

        await recordPoll(current.db, [silent("aws")], at);

        expect((await decisionOf("aws", at)).status).toBe("unreachable");
    });

    it("o segundo Poll sem resposta depois do deploy é Down", async () => {
        await insertOldCheck("aws", "unreachable", earlier);
        await current.migrateRest();

        await recordPoll(current.db, [silent("aws")], at);
        await recordPoll(current.db, [silent("aws")], later);

        expect((await decisionOf("aws", later)).status).toBe("down");
    });

    it("antes do primeiro Poll depois do deploy, a linha antiga continua decidindo como antes", async () => {
        await insertOldCheck("aws", "degraded", earlier);
        await insertOldCheck("azure", "unreachable", earlier);
        await insertOldCheck("oracle-cloud", "operational", earlier);
        await current.migrateRest();

        expect((await decisionOf("aws", earlier)).status).toBe("degraded");
        expect((await decisionOf("azure", earlier)).status).toBe("unreachable");
        expect(await decisionOf("oracle-cloud", earlier)).toMatchObject({ status: "operational", accessOnly: true });
    });

    it("a última leitura antiga vale até o primeiro Poll novo, que passa a valer sozinho", async () => {
        await insertOldCheck("aws", "outage", earlier);
        await current.migrateRest();

        await recordPoll(current.db, [{
            providerId: "aws", accessOnly: false, probes: [true],
            feeds: [{ sourceId: "aws-feed", read: true, declared: "operational", incidents: [] }],
        }], at);

        expect((await decisionOf("aws", at)).status).toBe("operational");
    });
});
