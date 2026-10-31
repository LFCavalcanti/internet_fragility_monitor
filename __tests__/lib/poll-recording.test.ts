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
import type { DeclaredStatus, PublishedIncident, ReadIncident } from "@/lib/status-feed/types";
import { feedFixture } from "../helpers/status-feed";
import { hoursBefore } from "../helpers/time";

let current: MigratedDb;

const at = new Date("2026-10-28T12:00:00Z");
const earlier = new Date("2026-10-28T11:55:00Z");

/** Instante como o Drizzle grava as colunas `timestamp`: segundos desde a época. */
const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

/** O Feed de cada Provider no catálogo, o id real da Provider Source. */
const feedOf = (providerId: string) => `${providerId}-feed`;

/** A leitura de um Feed: cada Incident recebe a fonte, como a política de leitura faz. */
const readFrom = (sourceId: string, incidents: PublishedIncident[] = [], declared: DeclaredStatus = "operational") => ({
    sourceId,
    read: true as const,
    declared,
    incidents: incidents.map((incident): ReadIncident => ({ ...incident, sourceId })),
});

const unreadFrom = (sourceId: string) => ({ sourceId, read: false as const });

type Reading = ProviderReading<ReadIncident>;

/** Um Provider com um Feed só, lido. */
const feedRead = (providerId: string, incidents: PublishedIncident[] = [], declared: DeclaredStatus = "operational"): Reading => ({
    providerId,
    accessOnly: false,
    feeds: [readFrom(feedOf(providerId), incidents, declared)],
    probes: [],
});

const feedUnread = (providerId: string): Reading => ({ providerId, accessOnly: false, feeds: [unreadFrom(feedOf(providerId))], probes: [] });

/** Um Provider com vários Feeds, na ordem do catálogo. */
const feedsOf = (providerId: string, ...feeds: Reading["feeds"]): Reading => ({ providerId, accessOnly: false, feeds, probes: [] });

/** Sem id explícito, o id publicado é o próprio título: o caso em que o Feed não publica id. */
const problem = (title: string, overrides: Partial<PublishedIncident> = {}): PublishedIncident =>
    ({ kind: "problem", title, externalId: title, status: "investigating", createdAt: hoursBefore(at, 1), ...overrides }) as PublishedIncident;

const maintenance = (title: string, overrides: Partial<PublishedIncident> = {}): PublishedIncident =>
    ({ kind: "maintenance", title, externalId: title, status: "scheduled", createdAt: hoursBefore(at, 24), ...overrides }) as PublishedIncident;

/** O segundo Feed do GitHub: o catálogo de hoje tem no máximo um Feed ativo por Provider. */
const addSecondGithubFeed = () =>
    current.client.execute(
        "INSERT INTO provider_sources (id, provider_id, kind, family, url, label) VALUES ('github-feed-2', 'github', 'feed', 'statuspage', 'https://second.example.test', 'feed')",
    );

async function rows(sql: string) {
    return (await current.client.execute(sql)).rows;
}

const incidentsOf = (providerId: string) =>
    rows(`SELECT * FROM incidents WHERE provider_id = '${providerId}' ORDER BY created_at, title`);

const checksOf = async (providerId: string) =>
    (await rows(`SELECT status FROM status_checks WHERE provider_id = '${providerId}' ORDER BY id`)).map(r => r.status);

/** Linha antiga, sem fonte e sem id: como o banco chega ao primeiro Poll depois da migration da identidade. */
async function seedOldRow(overrides: Record<string, unknown> = {}) {
    const row = {
        id: "inc-1", provider_id: "aws", title: "Old incident", description: null, status: "investigating", kind: "problem",
        scheduled_for: null, created_at: seconds(hoursBefore(at, 2)), updated_at: seconds(hoursBefore(at, 2)), resolved_at: null,
        ...overrides,
    };
    const columns = Object.keys(row);
    await current.client.execute({
        sql: `INSERT INTO incidents (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        args: Object.values(row) as (string | number | null)[],
    });
}

/** Incident já identificado: do Feed do Provider, com o título como id, igual a `problem` e `maintenance`. */
const seedIncident = ({ provider_id = "aws", title = "Old incident", ...overrides }: Record<string, unknown> = {}) =>
    seedOldRow({ provider_id, title, source_id: feedOf(String(provider_id)), external_id: title, ...overrides });

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
            feedsOf("github", readFrom("github-feed", [], "degraded"), unreadFrom("github-feed-2")),
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

    it("atualiza a fase, a descrição e as datas do Incident conhecido, na mesma linha", async () => {
        await seedIncident({ description: "Old description" });

        await recordPoll(current.db, [
            feedRead("aws", [problem("Old incident", { status: "monitoring", description: "New description", createdAt: hoursBefore(at, 3) })]),
        ], at);

        expect(await incidentsOf("aws")).toEqual([
            expect.objectContaining({
                id: "inc-1", status: "monitoring", description: "New description",
                created_at: seconds(hoursBefore(at, 3)), updated_at: seconds(at),
            }),
        ]);
    });

    it("só a descrição mudou: também é atualização", async () => {
        await seedIncident({ description: "Old description", created_at: seconds(hoursBefore(at, 1)) });

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { description: "New description" })])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ description: "New description", updated_at: seconds(at) });
    });

    it("o título publicado acompanha o Feed: mudar de nome não muda o Incident", async () => {
        await seedIncident({ title: "Elevated errors", external_id: "abc", created_at: seconds(hoursBefore(at, 1)) });

        await recordPoll(current.db, [
            feedRead("aws", [problem("Elevated errors in us-east-1", { externalId: "abc" })]),
        ], at);

        expect(await incidentsOf("aws")).toEqual([
            expect.objectContaining({ id: "inc-1", title: "Elevated errors in us-east-1", updated_at: seconds(at) }),
        ]);
    });

    it("o link publicado acompanha o Feed, e sem link fica o gravado", async () => {
        await seedIncident({ url: "https://example.test/old", created_at: seconds(hoursBefore(at, 1)) });

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { url: "https://example.test/new" })])], earlier);
        expect((await incidentsOf("aws"))[0].url).toBe("https://example.test/new");

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident")])], at);
        expect((await incidentsOf("aws"))[0]).toMatchObject({ url: "https://example.test/new", updated_at: seconds(earlier) });
    });

    it("mantém a descrição gravada quando a atualização não traz outra", async () => {
        await seedIncident({ description: "Kept" });

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { status: "identified" })])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ status: "identified", description: "Kept" });
    });

    it("não toca no Incident que veio igual", async () => {
        await seedIncident();

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { createdAt: hoursBefore(at, 2) })])], at);

        expect((await incidentsOf("aws"))[0].updated_at).toBe(seconds(hoursBefore(at, 2)));
    });

    it("uma data publicada com milissegundos, que a coluna guarda em segundos, não conta como mudança", async () => {
        const createdAt = new Date("2026-10-28T10:00:00.750Z");
        const scheduledFor = new Date("2026-10-29T05:00:00.250Z");
        const published = maintenance("With fractions", { createdAt, scheduledFor });

        await recordPoll(current.db, [feedRead("cloudflare", [published])], earlier);
        await recordPoll(current.db, [feedRead("cloudflare", [published])], at);

        expect((await incidentsOf("cloudflare"))[0].updated_at).toBe(seconds(earlier));
    });

    it("um título com espaços nas pontas é reconhecido no Poll seguinte, sem linha nova", async () => {
        await recordPoll(current.db, [feedRead("aws", [problem(" Spaced title ")])], earlier);
        await recordPoll(current.db, [feedRead("aws", [problem(" Spaced title ")])], at);

        expect(await incidentsOf("aws")).toHaveLength(1);
    });

    it("atualiza a manutenção quando a data marcada muda, mesmo com a fase igual", async () => {
        const moved = new Date("2026-10-30T05:00:00Z");
        await seedIncident({ kind: "maintenance", status: "scheduled", scheduled_for: seconds(new Date("2026-10-29T05:00:00Z")) });

        await recordPoll(current.db, [feedRead("aws", [maintenance("Old incident", { scheduledFor: moved })])], at);

        expect((await incidentsOf("aws"))[0].scheduled_for).toBe(seconds(moved));
    });

    it("não toca na manutenção sem mudança de fase nem de data", async () => {
        const scheduledFor = new Date("2026-10-29T05:00:00Z");
        await seedIncident({ kind: "maintenance", status: "scheduled", scheduled_for: seconds(scheduledFor) });

        await recordPoll(current.db, [feedRead("aws", [maintenance("Old incident", { scheduledFor, createdAt: hoursBefore(at, 2) })])], at);

        expect((await incidentsOf("aws"))[0].updated_at).toBe(seconds(hoursBefore(at, 2)));
    });

    it("a manutenção encerrada que continua no Feed volta à fase aberta e perde a hora do encerramento", async () => {
        // ex.: manutenção encerrada pela migration 0002 que reaparece no Feed como scheduled
        const scheduledFor = new Date("2026-10-29T05:00:00Z");
        await seedIncident({ kind: "maintenance", status: "completed", resolved_at: seconds(earlier) });

        await recordPoll(current.db, [feedRead("aws", [maintenance("Old incident", { scheduledFor })])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({
            status: "scheduled", scheduled_for: seconds(scheduledFor), resolved_at: null,
        });
    });

    it("o problema que volta de resolved para investigating perde a hora do encerramento", async () => {
        await seedIncident({ status: "resolved", resolved_at: seconds(earlier) });

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident")])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ status: "investigating", resolved_at: null });
    });

    it.each([
        ["problem", "resolved", problem("Old incident", { status: "resolved" })],
        ["maintenance", "completed", maintenance("Old incident", { status: "completed" })],
    ])("o %s que o Feed encerra (%s) ganha a hora do Poll", async (kind, status, incident) => {
        await seedIncident({ kind, status: kind === "problem" ? "investigating" : "in_progress" });

        await recordPoll(current.db, [feedRead("aws", [incident])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ status, resolved_at: seconds(at) });
    });

    it("o encerrado que muda de texto no Feed guarda a hora em que foi encerrado", async () => {
        await seedIncident({ status: "resolved", resolved_at: seconds(earlier) });

        await recordPoll(current.db, [
            feedRead("aws", [problem("Old incident", { status: "resolved", description: "Post-mortem" })]),
        ], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ description: "Post-mortem", resolved_at: seconds(earlier) });
    });

    it("a hora de resolução publicada vale para o Incident conhecido", async () => {
        const resolvedAt = hoursBefore(at, 1);
        await seedIncident();

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { status: "resolved", resolvedAt })])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ status: "resolved", resolved_at: seconds(resolvedAt) });
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

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident")])], at);

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

describe("identidade do Incident: Provider Source e id publicado", () => {
    const github = (first: PublishedIncident[], second?: PublishedIncident[]) =>
        feedsOf("github", readFrom("github-feed", first), second ? readFrom("github-feed-2", second) : unreadFrom("github-feed-2"));

    beforeEach(addSecondGithubFeed);

    it("grava a fonte e o id publicado", async () => {
        await recordPoll(current.db, [feedRead("aws", [problem("Elevated errors", { externalId: "abc" })])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ source_id: "aws-feed", external_id: "abc" });
    });

    it("duas manutenções com o mesmo título e ids diferentes viram dois Incidents", async () => {
        const windows = [
            maintenance("Heroku Platform Maintenance", { externalId: "2965", status: "completed", createdAt: hoursBefore(at, 48) }),
            maintenance("Heroku Platform Maintenance", { externalId: "2959", status: "scheduled", createdAt: hoursBefore(at, 24) }),
        ];

        await recordPoll(current.db, [feedRead("heroku", windows)], earlier);
        await recordPoll(current.db, [feedRead("heroku", windows)], at);

        expect((await incidentsOf("heroku")).map(r => [r.external_id, r.status, r.updated_at])).toEqual([
            ["2965", "completed", seconds(earlier)],
            ["2959", "scheduled", seconds(earlier)],
        ]);
    });

    it("um título repetido com id novo vira Incident novo, com a data dele", async () => {
        const createdAt = hoursBefore(at, 1);
        await seedIncident({ external_id: "first", status: "resolved", resolved_at: seconds(hoursBefore(at, 2000)), created_at: seconds(hoursBefore(at, 2001)) });

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { externalId: "second", createdAt })])], at);

        expect((await incidentsOf("aws")).map(r => [r.external_id, r.status, r.created_at])).toEqual([
            ["first", "resolved", seconds(hoursBefore(at, 2001))],
            ["second", "investigating", seconds(createdAt)],
        ]);
    });

    it("o id volta a abrir depois de encerrado: a mesma linha, sem hora de encerramento, com a data da nova ocorrência", async () => {
        // O evento da AWS é serviço e região: uma nova ocorrência repete o id.
        const event = { externalId: "ec2-us-east-1" };
        await recordPoll(current.db, [feedRead("aws", [problem("Elevated errors", { ...event, createdAt: hoursBefore(at, 700) })])], hoursBefore(at, 700));
        await recordPoll(current.db, [feedRead("aws")], hoursBefore(at, 600));
        const [closed] = await incidentsOf("aws");
        expect(closed).toMatchObject({ status: "resolved", resolved_at: seconds(hoursBefore(at, 600)) });

        await recordPoll(current.db, [feedRead("aws", [problem("Elevated errors", { ...event, createdAt: hoursBefore(at, 1) })])], at);

        expect(await incidentsOf("aws")).toEqual([
            expect.objectContaining({ id: closed.id, status: "investigating", resolved_at: null, created_at: seconds(hoursBefore(at, 1)) }),
        ]);
    });

    it("o mesmo id em dois Feeds são dois Incidents: juntar entre Feeds está fora de escopo", async () => {
        await recordPoll(current.db, [github([problem("Same", { externalId: "x" })], [problem("Same", { externalId: "x" })])], at);

        expect((await incidentsOf("github")).map(r => r.source_id).sort()).toEqual(["github-feed", "github-feed-2"]);
    });

    it("o mesmo par repetido dentro de um Feed vira uma linha, sem recusar o Poll: vale o último", async () => {
        await recordPoll(current.db, [
            feedRead("aws", [problem("Twice", { externalId: "x" }), problem("Twice", { externalId: "x", status: "identified" })]),
            feedRead("azure"),
        ], at);

        expect((await incidentsOf("aws")).map(r => r.status)).toEqual(["identified"]);
        expect(await checksOf("azure")).toEqual(["operational"]);
    });

    it("Incident ausente de Feed lido é resolvido", async () => {
        await recordPoll(current.db, [feedRead("aws", [problem("Gone", { externalId: "x" })])], earlier);

        await recordPoll(current.db, [feedRead("aws", [problem("Stays", { externalId: "y" })])], at);

        expect((await incidentsOf("aws")).map(r => [r.external_id, r.status, r.resolved_at])).toEqual([
            ["x", "resolved", seconds(at)],
            ["y", "investigating", null],
        ]);
    });

    it("o título igual a outro não segura aberto o Incident que saiu do Feed", async () => {
        await recordPoll(current.db, [feedRead("aws", [problem("Same title", { externalId: "x", createdAt: hoursBefore(at, 2) })])], earlier);

        await recordPoll(current.db, [feedRead("aws", [problem("Same title", { externalId: "y", createdAt: hoursBefore(at, 1) })])], at);

        expect((await incidentsOf("aws")).map(r => [r.external_id, r.status])).toEqual([
            ["x", "resolved"],
            ["y", "investigating"],
        ]);
    });

    it("Incident de Feed não lido não é resolvido, mesmo com o Provider lido por outro Feed", async () => {
        await recordPoll(current.db, [github([], [problem("From the second", { externalId: "x" })])], earlier);

        await recordPoll(current.db, [github([])], at);

        expect((await incidentsOf("github"))[0]).toMatchObject({ status: "investigating", resolved_at: null, updated_at: seconds(earlier) });
    });

    it("sob Partial Reading, o Incident ausente do Feed lido é resolvido", async () => {
        await recordPoll(current.db, [github([problem("From the first", { externalId: "x" })], [])], earlier);

        await recordPoll(current.db, [github([])], at);

        expect((await incidentsOf("github"))[0]).toMatchObject({ status: "resolved", resolved_at: seconds(at) });
    });

    it("um Feed que volta a ser lido encerra o que saiu dele enquanto esteve fora", async () => {
        await recordPoll(current.db, [github([], [problem("From the second", { externalId: "x" })])], earlier);
        await recordPoll(current.db, [github([])], at);

        await recordPoll(current.db, [github([], [])], new Date(at.getTime() + 300_000));

        expect((await incidentsOf("github"))[0].status).toBe("resolved");
    });

    it("as manutenções da Heroku, de mesmo título, não alternam de fase entre os Polls: payload real", async () => {
        const windows = JSON.parse(feedFixture("heroku", "current-status.json")).scheduled as { id: number; title: string; created_at: string }[];
        const published = windows.map(w => maintenance(w.title, { externalId: String(w.id), createdAt: new Date(w.created_at) }));
        expect(new Set(published.map(p => p.title)).size).toBe(1);

        await recordPoll(current.db, [feedRead("heroku", published)], earlier);
        await recordPoll(current.db, [feedRead("heroku", published)], at);

        const rows = await incidentsOf("heroku");
        expect(rows.map(r => r.external_id).sort()).toEqual(windows.map(w => String(w.id)).sort());
        expect(rows.every(r => r.updated_at === seconds(earlier))).toBe(true);
    });

    it("as 25 manutenções da Cloudflare, com 22 títulos, viram 25 Incidents e 25 na Upcoming Maintenance: payload real", async () => {
        const items = JSON.parse(feedFixture("statuspage", "cloudflare-major.json")).scheduled_maintenances as
            { id: string; name: string; created_at: string; scheduled_for: string }[];
        const published = items.map(m => maintenance(m.name, {
            externalId: m.id, createdAt: new Date(m.created_at), scheduledFor: new Date(m.scheduled_for),
        }));
        const clock = new Date(Math.min(...items.map(m => Date.parse(m.scheduled_for))) - 1000);

        await recordPoll(current.db, [feedRead("cloudflare", published)], earlier);
        await recordPoll(current.db, [feedRead("cloudflare", published)], at);

        expect(await incidentsOf("cloudflare")).toHaveLength(25);
        const { reading } = (await readSnapshot(current.db, clock)).providers.find(e => e.provider.id === "cloudflare")!;
        expect(decideProviderStatus({ ...reading, now: clock }).upcomingMaintenance?.count).toBe(25);
    });
});

describe("passagem única: linhas antigas, sem fonte e sem id", () => {
    beforeEach(addSecondGithubFeed);

    it("o Incident com id assume a linha aberta do mesmo Provider e título, com a fase e as datas do Feed", async () => {
        await seedOldRow({ description: "Kept" });

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { externalId: "abc", status: "identified" })])], at);

        expect(await incidentsOf("aws")).toEqual([
            expect.objectContaining({
                id: "inc-1", source_id: "aws-feed", external_id: "abc", status: "identified", description: "Kept",
                created_at: seconds(hoursBefore(at, 1)), updated_at: seconds(at),
            }),
        ]);
    });

    it("assume mesmo sem nada para atualizar além da identidade, e o Poll seguinte acha a linha pelo par", async () => {
        await seedOldRow();
        const same = problem("Old incident", { externalId: "abc", createdAt: hoursBefore(at, 2) });

        await recordPoll(current.db, [feedRead("aws", [same])], earlier);
        await recordPoll(current.db, [feedRead("aws", [same])], at);

        expect(await incidentsOf("aws")).toEqual([
            expect.objectContaining({ id: "inc-1", external_id: "abc", updated_at: seconds(earlier) }),
        ]);
    });

    it("a linha aberta que ninguém assumiu é resolvida no fim do Poll, pelo tipo dela", async () => {
        await seedOldRow({ id: "problem" });
        await seedOldRow({ id: "maintenance", title: "Old window", kind: "maintenance", status: "in_progress" });

        await recordPoll(current.db, [feedRead("aws", [problem("Something else", { externalId: "abc" })])], at);

        const rows = Object.fromEntries((await incidentsOf("aws")).map(r => [r.id, [r.status, r.resolved_at]]));
        expect(rows.problem).toEqual(["resolved", seconds(at)]);
        expect(rows.maintenance).toEqual(["completed", seconds(at)]);
    });

    it("assume a linha cujo título a gravação antiga cortou nas pontas", async () => {
        await seedOldRow({ title: "Spaced title" });

        await recordPoll(current.db, [feedRead("aws", [problem(" Spaced title ", { externalId: "abc" })])], at);

        expect(await incidentsOf("aws")).toEqual([expect.objectContaining({ id: "inc-1", title: " Spaced title ", external_id: "abc" })]);
    });

    it("não assume a linha de outro Provider", async () => {
        await seedOldRow({ provider_id: "azure" });

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { externalId: "abc" })])], at);

        expect((await incidentsOf("azure"))[0]).toMatchObject({ source_id: null, status: "investigating" });
        expect((await incidentsOf("aws"))[0].id).not.toBe("inc-1");
    });

    it("dois Incidents com o mesmo título disputam uma linha: um assume, o outro é inserido, e nada fica sem fonte", async () => {
        await seedOldRow({ kind: "maintenance", status: "scheduled", title: "Window" });

        await recordPoll(current.db, [feedRead("aws", [
            maintenance("Window", { externalId: "first" }),
            maintenance("Window", { externalId: "second", status: "in_progress" }),
        ])], at);

        const rows = await incidentsOf("aws");
        expect(rows.map(r => [r.external_id, r.status]).sort()).toEqual([["first", "scheduled"], ["second", "in_progress"]]);
        expect(rows.find(r => r.external_id === "first")?.id).toBe("inc-1");
    });

    it("as duplicatas da Cloudflare: cada Incident assume uma linha, e a que sobra é resolvida", async () => {
        const row = { provider_id: "cloudflare", title: "DUR (Durban)", kind: "maintenance", status: "scheduled" };
        await seedOldRow({ ...row, id: "dup-1" });
        await seedOldRow({ ...row, id: "dup-2" });
        await seedOldRow({ ...row, id: "dup-3" });

        await recordPoll(current.db, [feedRead("cloudflare", [
            maintenance("DUR (Durban)", { externalId: "a" }),
            maintenance("DUR (Durban)", { externalId: "b" }),
        ])], at);

        const rows = await incidentsOf("cloudflare");
        expect(rows).toHaveLength(3);
        expect(rows.filter(r => r.status === "scheduled").map(r => r.external_id).sort()).toEqual(["a", "b"]);
        expect(rows.filter(r => r.status === "completed").map(r => r.external_id)).toEqual([null]);
    });

    it("só a linha aberta é assumida: a encerrada fica como histórico, e o Incident vira linha nova", async () => {
        await seedOldRow({ status: "resolved", resolved_at: seconds(earlier) });

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { externalId: "abc" })])], at);

        expect((await incidentsOf("aws")).map(r => [r.id === "inc-1", r.status, r.external_id]).sort()).toEqual([
            [false, "investigating", "abc"],
            [true, "resolved", null],
        ]);
    });

    it("depois da passagem, o título não é mais chave: quem volta com aquele título não reabre a linha resolvida", async () => {
        await seedOldRow();
        await recordPoll(current.db, [feedRead("aws")], earlier);

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { externalId: "abc" })])], at);

        expect((await incidentsOf("aws")).map(r => [r.id === "inc-1", r.status, r.resolved_at]).sort()).toEqual([
            [false, "investigating", null],
            [true, "resolved", seconds(earlier)],
        ]);
    });

    it("um Incident já identificado nunca é assumido pelo título", async () => {
        await seedIncident({ external_id: "first" });

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { externalId: "second" })])], at);

        expect((await incidentsOf("aws")).map(r => r.external_id).sort()).toEqual(["first", "second"]);
    });

    it("o Incident já identificado não disputa a linha antiga de mesmo título, que acaba resolvida", async () => {
        await seedIncident({ id: "known", external_id: "abc" });
        await seedOldRow({ id: "old" });

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { externalId: "abc" })])], at);

        const rows = Object.fromEntries((await incidentsOf("aws")).map(r => [r.id, r.status]));
        expect(rows).toEqual({ known: "investigating", old: "resolved" });
    });

    it("com o Feed não lido, a linha antiga fica como está", async () => {
        await seedOldRow();

        await recordPoll(current.db, [feedUnread("aws")], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ source_id: null, status: "investigating", resolved_at: null });
    });

    it("sob Partial Reading, a linha antiga não assumida fica aberta: ela pode ser do Feed não lido", async () => {
        await seedOldRow({ provider_id: "github", title: "Of the unread Feed" });

        await recordPoll(current.db, [feedsOf("github", readFrom("github-feed", []), unreadFrom("github-feed-2"))], at);

        expect((await incidentsOf("github"))[0]).toMatchObject({ source_id: null, status: "investigating", resolved_at: null });
    });

    it("sob Partial Reading, o Incident do Feed lido ainda assume a linha antiga do mesmo título", async () => {
        await seedOldRow({ provider_id: "github", title: "Shared" });

        await recordPoll(current.db, [
            feedsOf("github", readFrom("github-feed", [problem("Shared", { externalId: "abc" })]), unreadFrom("github-feed-2")),
        ], at);

        expect(await incidentsOf("github")).toEqual([expect.objectContaining({ id: "inc-1", source_id: "github-feed", external_id: "abc" })]);
    });

    it("a linha antiga que esperou a Partial Reading é assumida ou resolvida no primeiro Poll com todos os Feeds lidos", async () => {
        await seedOldRow({ id: "taken", provider_id: "github", title: "Comes back" });
        await seedOldRow({ id: "left", provider_id: "github", title: "Never comes back" });
        await recordPoll(current.db, [feedsOf("github", readFrom("github-feed", []), unreadFrom("github-feed-2"))], earlier);

        await recordPoll(current.db, [
            feedsOf("github", readFrom("github-feed", []), readFrom("github-feed-2", [problem("Comes back", { externalId: "abc" })])),
        ], at);

        const rows = Object.fromEntries((await incidentsOf("github")).map(r => [r.id, [r.status, r.source_id]]));
        expect(rows).toEqual({ taken: ["investigating", "github-feed-2"], left: ["resolved", null] });
    });

    it("Provider só com Probes não tem Feed e não reconcilia: a linha antiga fica como está", async () => {
        await seedOldRow({ provider_id: "oracle-cloud" });

        await recordPoll(current.db, [{ providerId: "oracle-cloud", accessOnly: true, feeds: [], probes: [true] }], at);

        expect((await incidentsOf("oracle-cloud"))[0]).toMatchObject({ status: "investigating", resolved_at: null });
    });

    it("um Incident encerrado no Feed que assume a linha aberta guarda a hora publicada, sem parecer recém-resolvido", async () => {
        const resolvedAt = hoursBefore(at, 500);
        await seedOldRow();

        await recordPoll(current.db, [feedRead("aws", [problem("Old incident", { externalId: "abc", status: "resolved", resolvedAt })])], at);

        expect((await incidentsOf("aws"))[0]).toMatchObject({ id: "inc-1", status: "resolved", resolved_at: seconds(resolvedAt) });
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
        feedRead("azure", [{ kind, title: "Issue", externalId: "issue", status, createdAt: at } as PublishedIncident]);

    async function expectNothingRecorded(reading: Reading, error: string) {
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
            { providerId: "aws", accessOnly: false, feeds: [{ sourceId: "aws-feed", read: false, answered: false }], probes: [true] },
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

describe("ler o Snapshot: cada Incident fica no seu Feed", () => {
    const decisionOf = async (providerId: string) => {
        const { reading } = (await readSnapshot(current.db, at)).providers.find(e => e.provider.id === providerId)!;
        return decideProviderStatus({ ...reading, now: at });
    };
    const inProgress = maintenance("Network upgrade", { externalId: "m", status: "in_progress", scheduledFor: hoursBefore(at, 1) });
    const upcoming = maintenance("Future window", { externalId: "u", scheduledFor: new Date("2026-11-20T05:00:00Z") });
    const FEEDS = ["github-feed", "github-feed-2"];

    beforeEach(addSecondGithubFeed);

    it.each([["github-feed", "github-feed-2"], ["github-feed-2", "github-feed"]])(
        "a manutenção em andamento e a agendada de %s, não lido, não decidem, mas o andamento continua na lista",
        async (unread, stillRead) => {
            await recordPoll(current.db, [feedsOf("github", ...FEEDS.map(id => readFrom(id, id === unread ? [inProgress, upcoming] : [])))], earlier);

            await recordPoll(current.db, [feedsOf("github", ...FEEDS.map(id => (id === stillRead ? readFrom(id) : unreadFrom(id))))], at);

            const decision = await decisionOf("github");
            expect(decision).toMatchObject({ status: "operational", upcomingMaintenance: null, partialReading: { unread: 1, total: 2 } });
            expect(decision.incidents.map(i => i.title)).toEqual(["Network upgrade"]);
        },
    );

    it("com os dois Feeds lidos, a manutenção e a agendada de qualquer um decidem", async () => {
        await recordPoll(current.db, [feedsOf("github", readFrom("github-feed"), readFrom("github-feed-2", [inProgress, upcoming]))], at);

        expect(await decisionOf("github")).toMatchObject({ status: "maintenance", upcomingMaintenance: { count: 1 }, partialReading: null });
    });

    it("sob Partial Reading, os Incidents do Feed lido seguem decidindo", async () => {
        await recordPoll(current.db, [
            feedsOf("github", unreadFrom("github-feed"), readFrom("github-feed-2", [inProgress, upcoming])),
        ], at);

        expect(await decisionOf("github")).toMatchObject({ status: "maintenance", upcomingMaintenance: { count: 1 }, partialReading: { unread: 1, total: 2 } });
    });

    it("sob Partial Reading, a linha antiga não decide: ela pode ser do Feed não lido", async () => {
        await seedOldRow({ provider_id: "github", title: "Old window", kind: "maintenance", status: "in_progress" });

        await recordPoll(current.db, [feedsOf("github", readFrom("github-feed"), unreadFrom("github-feed-2"))], at);

        const decision = await decisionOf("github");
        expect(decision.status).toBe("operational");
        expect(decision.incidents.map(i => i.title)).toEqual(["Old window"]);
    });

    it("antes do primeiro Poll depois da migration, a linha antiga continua decidindo como antes", async () => {
        await seedOldRow({ title: "Old window", kind: "maintenance", status: "in_progress" });
        await current.client.execute(`INSERT INTO status_checks (provider_id, status, checked_at) VALUES ('aws', 'operational', ${seconds(earlier)})`);

        expect((await decisionOf("aws")).status).toBe("maintenance");
    });

    it("um Incident de Feed desativado fica na lista, mesmo sem linha de leitura no Poll", async () => {
        await recordPoll(current.db, [feedsOf("github", readFrom("github-feed"), readFrom("github-feed-2", [inProgress]))], earlier);
        await current.client.execute("UPDATE provider_sources SET active = 0 WHERE id = 'github-feed-2'");

        await recordPoll(current.db, [feedRead("github")], at);

        expect((await decisionOf("github")).incidents.map(i => i.title)).toEqual(["Network upgrade"]);
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
