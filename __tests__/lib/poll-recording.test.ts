// @vitest-environment node
/**
 * Módulo de Poll Recording no banco real das migrations (SQLite em memória, decisão Q33):
 * cada caso grava Polls pelo módulo e confere o Snapshot lido de volta ou o que ficou nas tabelas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMigratedDb, type MigratedDb } from "../helpers/migrated-db";
import { readSnapshot, recordPoll } from "@/lib/poll-recording";
import { INCIDENT_DESCRIPTION_MAX, INCIDENT_TITLE_MAX } from "@/lib/incident-status";
import { decideProviderStatus } from "@/lib/provider-status";
import type { ProviderReading } from "@/lib/status-feed/provider-reading";
import type { DeclaredStatus, IncidentData } from "@/lib/status-feed/types";
import { hoursBefore } from "../helpers/time";

let current: MigratedDb;

const at = new Date("2026-10-28T12:00:00Z");
const earlier = new Date("2026-10-28T11:55:00Z");

/** Instante como o Drizzle grava as colunas `timestamp`: segundos desde a época. */
const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

/** Um Provider com um Feed só, lido. */
const feedRead = (providerId: string, incidents: IncidentData[] = [], declared: DeclaredStatus = "operational"): ProviderReading => ({
    providerId,
    accessOnly: false,
    feeds: [{ read: true, declared, incidents }],
    probes: [],
});

const feedUnread = (providerId: string): ProviderReading => ({ providerId, accessOnly: false, feeds: [{ read: false }], probes: [] });

const problem = (title: string, overrides: Partial<IncidentData> = {}): IncidentData =>
    ({ kind: "problem", title, status: "investigating", createdAt: hoursBefore(at, 1), ...overrides }) as IncidentData;

const maintenance = (title: string, overrides: Partial<IncidentData> = {}): IncidentData =>
    ({ kind: "maintenance", title, status: "scheduled", createdAt: hoursBefore(at, 24), ...overrides }) as IncidentData;

async function rows(sql: string) {
    return (await current.client.execute(sql)).rows;
}

const incidentsOf = (providerId: string) =>
    rows(`SELECT * FROM incidents WHERE provider_id = '${providerId}' ORDER BY created_at, title`);

const checksOf = async (providerId: string) =>
    (await rows(`SELECT status FROM status_checks WHERE provider_id = '${providerId}' ORDER BY id`)).map(r => r.status);

async function seedIncident(overrides: Record<string, unknown> = {}) {
    const row = {
        id: "inc-1", provider_id: "aws", title: "Old issue", description: null, status: "investigating", kind: "problem",
        scheduled_for: null, created_at: seconds(hoursBefore(at, 2)), updated_at: seconds(hoursBefore(at, 2)), resolved_at: null,
        ...overrides,
    };
    const columns = Object.keys(row);
    await current.client.execute({
        sql: `INSERT INTO incidents (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        args: Object.values(row) as (string | number | null)[],
    });
}

beforeEach(async () => {
    current = await createMigratedDb();
    vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("gravar um Poll: leituras", () => {
    it("grava a leitura de cada Provider com a hora do Poll", async () => {
        await recordPoll(current.db, [feedRead("aws", [], "degraded"), feedRead("azure")], at);

        expect(await checksOf("aws")).toEqual(["degraded"]);
        expect(await checksOf("azure")).toEqual(["operational"]);
        expect(await rows("SELECT DISTINCT checked_at FROM status_checks")).toEqual([
            expect.objectContaining({ checked_at: seconds(at) }),
        ]);
    });

    it("todas as leituras de um Poll saem com a mesma hora, mesmo com o relógio correndo", async () => {
        await recordPoll(current.db, [feedRead("aws"), feedRead("azure"), feedRead("github")]);

        expect(await rows("SELECT DISTINCT checked_at FROM status_checks")).toHaveLength(1);
    });

    it("grava uma linha por Feed, com o não lido como unreachable", async () => {
        await recordPoll(current.db, [
            { providerId: "github", accessOnly: false, feeds: [{ read: true, declared: "degraded", incidents: [] }, { read: false }], probes: [] },
        ], at);

        expect(await checksOf("github")).toEqual(["degraded", "unreachable"]);
    });

    it("Provider só com Probes grava uma leitura só: operational com algum Probe de pé, unreachable sem nenhum", async () => {
        await recordPoll(current.db, [
            { providerId: "oracle-cloud", accessOnly: true, feeds: [], probes: [false, true] },
            { providerId: "salesforce", accessOnly: true, feeds: [], probes: [false, false] },
        ], at);

        expect(await checksOf("oracle-cloud")).toEqual(["operational"]);
        expect(await checksOf("salesforce")).toEqual(["unreachable"]);
    });

    it("um Poll sem nenhum Provider não grava nada e não falha", async () => {
        await recordPoll(current.db, [], at);

        expect(await rows("SELECT id FROM status_checks")).toEqual([]);
    });

    it("não grava tempo de resposta: a duração da leitura vai só para o log", async () => {
        await recordPoll(current.db, [feedRead("aws")], at);

        expect((await rows("SELECT response_time FROM status_checks"))[0].response_time).toBeNull();
    });
});

describe("gravar um Poll: reconciliação de Incidents", () => {
    it("insere o Incident novo com título, descrição, fase, tipo, link e datas", async () => {
        const createdAt = hoursBefore(at, 3);

        await recordPoll(current.db, [
            feedRead("aws", [problem("New issue", { description: "Something happened", url: "https://example.test/1", createdAt })]),
        ], at);

        expect(await incidentsOf("aws")).toEqual([
            expect.objectContaining({
                title: "New issue", description: "Something happened", url: "https://example.test/1", status: "investigating",
                kind: "problem", scheduled_for: null, created_at: seconds(createdAt), updated_at: seconds(at), resolved_at: null,
            }),
        ]);
    });

    it("grava a hora de resolução que o Feed publica num Incident novo já resolvido", async () => {
        const resolvedAt = hoursBefore(at, 4);

        await recordPoll(current.db, [feedRead("aws", [problem("Done", { status: "resolved", resolvedAt })])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ status: "resolved", resolved_at: seconds(resolvedAt) });
    });

    it("grava manutenção nova com tipo, fase e data marcada", async () => {
        const scheduledFor = new Date("2026-10-29T05:00:00Z");

        await recordPoll(current.db, [feedRead("cloudflare", [maintenance("LIM (Lima) datacenter", { scheduledFor })])], at);

        expect((await incidentsOf("cloudflare"))[0]).toMatchObject({
            kind: "maintenance", status: "scheduled", scheduled_for: seconds(scheduledFor),
        });
    });

    it("atualiza a fase e a descrição do Incident conhecido, sem mexer na criação", async () => {
        await seedIncident({ description: "Old description" });

        await recordPoll(current.db, [
            feedRead("aws", [problem("Old issue", { status: "monitoring", description: "New description" })]),
        ], at);

        expect(await incidentsOf("aws")).toEqual([
            expect.objectContaining({
                id: "inc-1", status: "monitoring", description: "New description",
                created_at: seconds(hoursBefore(at, 2)), updated_at: seconds(at),
            }),
        ]);
    });

    it("mantém a descrição gravada quando a atualização não traz outra", async () => {
        await seedIncident({ description: "Kept" });

        await recordPoll(current.db, [feedRead("aws", [problem("Old issue", { status: "identified" })])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ status: "identified", description: "Kept" });
    });

    it("não toca no Incident que veio igual", async () => {
        await seedIncident();

        await recordPoll(current.db, [feedRead("aws", [problem("Old issue")])], at);

        expect((await incidentsOf("aws"))[0].updated_at).toBe(seconds(hoursBefore(at, 2)));
    });

    it("o título casa com o Incident mais novo do histórico do Provider, até a identidade pela fonte", async () => {
        await seedIncident({ id: "old", created_at: seconds(hoursBefore(at, 100)), status: "resolved" });
        await seedIncident({ id: "new", created_at: seconds(hoursBefore(at, 50)), status: "resolved" });

        await recordPoll(current.db, [feedRead("aws", [problem("Old issue")])], at);

        const statusById = Object.fromEntries((await incidentsOf("aws")).map(r => [r.id, r.status]));
        expect(statusById).toEqual({ old: "resolved", new: "investigating" });
    });

    it("um título com espaços nas pontas é reconhecido no Poll seguinte, sem linha nova", async () => {
        await recordPoll(current.db, [feedRead("aws", [problem(" Spaced title ")])], earlier);
        await recordPoll(current.db, [feedRead("aws", [problem(" Spaced title ")])], at);

        expect(await incidentsOf("aws")).toHaveLength(1);
    });

    it("atualiza a manutenção quando a data marcada muda, mesmo com a fase igual", async () => {
        const moved = new Date("2026-10-30T05:00:00Z");
        await seedIncident({ kind: "maintenance", status: "scheduled", scheduled_for: seconds(new Date("2026-10-29T05:00:00Z")) });

        await recordPoll(current.db, [feedRead("aws", [maintenance("Old issue", { scheduledFor: moved })])], at);

        expect((await incidentsOf("aws"))[0].scheduled_for).toBe(seconds(moved));
    });

    it("não toca na manutenção sem mudança de fase nem de data", async () => {
        const scheduledFor = new Date("2026-10-29T05:00:00Z");
        await seedIncident({ kind: "maintenance", status: "scheduled", scheduled_for: seconds(scheduledFor) });

        await recordPoll(current.db, [feedRead("aws", [maintenance("Old issue", { scheduledFor })])], at);

        expect((await incidentsOf("aws"))[0].updated_at).toBe(seconds(hoursBefore(at, 2)));
    });

    it("a manutenção encerrada que continua no Feed volta à fase aberta e perde a hora do encerramento", async () => {
        // ex.: manutenção encerrada pela migration 0002 que reaparece no Feed como scheduled
        const scheduledFor = new Date("2026-10-29T05:00:00Z");
        await seedIncident({ kind: "maintenance", status: "completed", resolved_at: seconds(earlier) });

        await recordPoll(current.db, [feedRead("aws", [maintenance("Old issue", { scheduledFor })])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({
            status: "scheduled", scheduled_for: seconds(scheduledFor), resolved_at: null,
        });
    });

    it("o problema que volta de resolved para investigating perde a hora do encerramento", async () => {
        await seedIncident({ status: "resolved", resolved_at: seconds(earlier) });

        await recordPoll(current.db, [feedRead("aws", [problem("Old issue")])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ status: "investigating", resolved_at: null });
    });

    it.each([
        ["problem", "resolved", problem("Old issue", { status: "resolved" })],
        ["maintenance", "completed", maintenance("Old issue", { status: "completed" })],
    ])("o %s que o Feed encerra (%s) ganha a hora do Poll", async (kind, status, incident) => {
        await seedIncident({ kind, status: kind === "problem" ? "investigating" : "in_progress" });

        await recordPoll(current.db, [feedRead("aws", [incident])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ status, resolved_at: seconds(at) });
    });

    it("encerra como problema o Incident que saiu do Feed, com a hora do Poll", async () => {
        await seedIncident();

        await recordPoll(current.db, [feedRead("aws")], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ status: "resolved", resolved_at: seconds(at), updated_at: seconds(at) });
    });

    it("encerra como manutenção a manutenção que saiu do Feed, não como problema", async () => {
        await seedIncident({ kind: "maintenance", status: "in_progress" });

        await recordPoll(current.db, [feedRead("aws")], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ status: "completed", resolved_at: seconds(at) });
    });

    it("não mexe no Incident encerrado que continua fora do Feed", async () => {
        await seedIncident({ status: "resolved", resolved_at: seconds(earlier) });

        await recordPoll(current.db, [feedRead("aws")], at);

        expect((await incidentsOf("aws"))[0].resolved_at).toBe(seconds(earlier));
    });

    it("um Feed não lido grava unreachable e não encerra nem altera os Incidents gravados", async () => {
        await seedIncident();
        await seedIncident({ id: "mnt-1", title: "Network upgrade", kind: "maintenance", status: "in_progress" });

        await recordPoll(current.db, [feedUnread("aws")], at);

        expect(await checksOf("aws")).toEqual(["unreachable"]);
        expect((await incidentsOf("aws")).map(r => r.status).sort()).toEqual(["in_progress", "investigating"]);
    });

    it("os Incidents de um Provider não encostam nos de outro", async () => {
        await seedIncident({ provider_id: "azure" });

        await recordPoll(current.db, [feedRead("aws", [problem("Old issue")])], at);

        expect(await incidentsOf("aws")).toHaveLength(1);
        expect((await incidentsOf("azure"))[0].status).toBe("investigating");
    });

    it("a leitura dos Incidents não cresce com o volume do Feed: 1000 itens não fazem mais consultas que 1", async () => {
        const selects = async (count: number) => {
            const incidents = Array.from({ length: count }, (_, i) => maintenance(`Instance ${i}`));
            const statements = await current.statementsDuring(() => recordPoll(current.db, [feedRead("salesforce", incidents)], at));
            return statements.filter(s => /^\s*select/i.test(s)).length;
        };

        const one = await selects(1);

        expect(await selects(1000)).toBe(one);
        expect(await incidentsOf("salesforce")).toHaveLength(1000);
    });
});

describe("gravar um Poll é uma transação", () => {
    /** Falha real do banco no meio da gravação: o segundo Provider não consegue gravar o Incident. */
    const failOnTitle = (title: string) =>
        current.client.execute(`CREATE TRIGGER fail_write BEFORE INSERT ON incidents WHEN NEW.title = '${title}'
            BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`);

    it("uma falha no meio não deixa nada gravado, nem do Provider que já tinha gravado", async () => {
        await seedIncident();
        await failOnTitle("Breaks the write");

        await expect(
            recordPoll(current.db, [
                feedRead("aws", [problem("Inserted before the failure")]),
                feedRead("azure", [problem("Breaks the write")]),
            ], at),
        ).rejects.toThrow();

        expect(await rows("SELECT id FROM status_checks")).toEqual([]);
        expect(await incidentsOf("azure")).toEqual([]);
        expect(await incidentsOf("aws")).toEqual([
            expect.objectContaining({ id: "inc-1", status: "investigating", updated_at: seconds(hoursBefore(at, 2)) }),
        ]);
    });

    it("o Snapshot lido depois da falha continua o do Poll anterior", async () => {
        await recordPoll(current.db, [feedRead("aws", [], "degraded")], earlier);
        await failOnTitle("Breaks the write");

        await recordPoll(current.db, [feedRead("aws", [problem("Breaks the write")])], at).catch(() => {});

        const snapshot = await readSnapshot(current.db, at);
        expect(snapshot.lastPollAt).toEqual(earlier);
        const aws = snapshot.providers.find(e => e.provider.id === "aws")!;
        expect(decideProviderStatus({ ...aws.reading, now: at }).status).toBe("degraded");
    });

    it("depois de uma falha, o Poll seguinte grava normalmente", async () => {
        await failOnTitle("Breaks the write");
        await recordPoll(current.db, [feedRead("aws", [problem("Breaks the write")])], earlier).catch(() => {});

        await recordPoll(current.db, [feedRead("aws", [problem("Fine")])], at);

        expect(await checksOf("aws")).toEqual(["operational"]);
        expect((await incidentsOf("aws")).map(r => r.title)).toEqual(["Fine"]);
    });
});

describe("os status gravados seguem o vocabulário do domínio", () => {
    const withDeclared = (declared: string) => feedRead("aws", [], declared as DeclaredStatus);
    const withStatus = (kind: "problem" | "maintenance", status: string) =>
        feedRead("azure", [{ kind, title: "Issue", status, createdAt: at } as IncidentData]);

    async function expectNothingRecorded(reading: ProviderReading, error: string) {
        // O Provider válido vai antes: um valor inválido desfaz o Poll inteiro.
        await expect(recordPoll(current.db, [feedRead("github"), reading], at)).rejects.toThrow(error);

        expect(await rows("SELECT id FROM status_checks")).toEqual([]);
        expect(await rows("SELECT id FROM incidents")).toEqual([]);
    }

    it.each(["operational", "degraded", "outage"])("aceita a leitura %s", async declared => {
        await recordPoll(current.db, [withDeclared(declared)], at);

        expect(await checksOf("aws")).toEqual([declared]);
    });

    // "unknown" saiu do vocabulário: falha de leitura é Unreachable (GLOSSARY.md)
    it.each(["unknown", "invalid", "OPERATIONAL", ""])("rejeita a leitura %j", async declared => {
        await expectNothingRecorded(withDeclared(declared), "aws");
    });

    it.each(["investigating", "identified", "monitoring", "resolved"])("aceita o problema em %s", async status => {
        await recordPoll(current.db, [withStatus("problem", status)], at);

        expect((await incidentsOf("azure"))[0].status).toBe(status);
    });

    it.each(["scheduled", "in_progress", "completed"])("aceita a manutenção em %s", async status => {
        await recordPoll(current.db, [withStatus("maintenance", status)], at);

        expect((await incidentsOf("azure"))[0].status).toBe(status);
    });

    it("rejeita o antigo status \"maintenance\": manutenção é um tipo, com fase própria", async () => {
        await expectNothingRecorded(withStatus("problem", "maintenance"), "azure");
    });

    it("rejeita a fase de manutenção num problema e a fase de problema numa manutenção", async () => {
        await expectNothingRecorded(withStatus("problem", "scheduled"), "azure");
        await expectNothingRecorded(withStatus("maintenance", "investigating"), "azure");
    });

    it("rejeita um tipo de Incident fora do vocabulário", async () => {
        await expectNothingRecorded(withStatus("alert" as "problem", "investigating"), "azure");
    });

    it("rejeita Incident sem título", async () => {
        await expectNothingRecorded(feedRead("azure", [problem("   ")]), "azure");
    });

    it("rejeita texto acima do limite, que a política de leitura corta antes de chegar aqui", async () => {
        await expectNothingRecorded(feedRead("azure", [problem("a".repeat(INCIDENT_TITLE_MAX + 1))]), "azure");
        await expectNothingRecorded(feedRead("azure", [problem("Issue", { description: "a".repeat(INCIDENT_DESCRIPTION_MAX + 1) })]), "azure");
    });

    it("aceita texto no limite", async () => {
        await recordPoll(current.db, [
            feedRead("azure", [problem("a".repeat(INCIDENT_TITLE_MAX), { description: "b".repeat(INCIDENT_DESCRIPTION_MAX) })]),
        ], at);

        expect(await incidentsOf("azure")).toHaveLength(1);
    });
});

describe("ler o Snapshot: hora do último Poll", () => {
    it("sem nenhum Poll gravado não há hora", async () => {
        expect((await readSnapshot(current.db, at)).lastPollAt).toBeNull();
    });

    it("é a hora do Poll mais recente", async () => {
        await recordPoll(current.db, [feedRead("aws", [], "outage")], earlier);
        await recordPoll(current.db, [feedRead("aws")], at);

        expect((await readSnapshot(current.db, at)).lastPollAt).toEqual(at);
    });

    it("um Poll gravado com todos os Feeds não lidos também conta: Poll sem resposta é descartado antes de gravar", async () => {
        await recordPoll(current.db, [feedRead("aws")], earlier);

        // Só os Probes de um Provider com Feed responderam.
        await recordPoll(current.db, [
            { providerId: "aws", accessOnly: false, feeds: [{ read: false, answered: false }], probes: [true] },
            { providerId: "oracle-cloud", accessOnly: true, feeds: [], probes: [false] },
        ], at);

        expect((await readSnapshot(current.db, at)).lastPollAt).toEqual(at);
    });

    it("a hora é a do Provider gravado por último, mesmo com outro Provider sem leitura nova", async () => {
        await recordPoll(current.db, [feedRead("aws"), feedRead("azure")], earlier);
        await recordPoll(current.db, [feedRead("azure")], at);

        expect((await readSnapshot(current.db, at)).lastPollAt).toEqual(at);
    });
});

describe("ler o Snapshot usa um número fixo de consultas", () => {
    const statementsOfRead = async () => (await current.statementsDuring(() => readSnapshot(current.db, at))).length;

    it("o número de consultas não depende de quantos Providers estão ativos", async () => {
        const many = await statementsOfRead();

        await current.client.execute("UPDATE providers SET active = 0 WHERE id <> 'aws'");

        expect(await statementsOfRead()).toBe(many);
    });

    it("o número de consultas não depende de quantas leituras e Incidents estão gravados", async () => {
        const empty = await statementsOfRead();

        await recordPoll(current.db, ["aws", "azure", "github"].map(id => feedRead(id, [problem(`Issue of ${id}`)])), at);

        expect(await statementsOfRead()).toBe(empty);
    });

    it("a leitura inteira sai de um só instante do banco: não enxerga um Poll entre duas consultas", async () => {
        await recordPoll(current.db, [feedRead("aws", [problem("First")], "degraded")], earlier);

        const reading = readSnapshot(current.db, at);
        const writing = recordPoll(current.db, [feedRead("aws", [problem("Second")], "outage")], at);
        const [snapshot] = await Promise.all([reading, writing]);

        const aws = snapshot.providers.find(e => e.provider.id === "aws")!;
        const decision = decideProviderStatus({ ...aws.reading, now: at });
        const titles = decision.incidents.map(i => i.title);
        expect([
            { status: "degraded", titles: ["First"] },
            { status: "outage", titles: ["Second", "First"] },
        ]).toContainEqual({ status: decision.status, titles });
    });
});
