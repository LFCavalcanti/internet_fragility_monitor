// @vitest-environment node
/**
 * Poll guiado pelo Provider Catalog, no banco real das migrations (SQLite em memória).
 * A rede é a única coisa simulada: cada URL responde como o Feed ou o Probe de verdade responderia.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMigratedDb, type MigratedDb } from "../helpers/migrated-db";
import { feedFixture, hang, healthyResponse, outcomeOf } from "../helpers/status-feed";

import { runPoll } from "@/lib/cron";
import { readActiveCatalog, readSnapshot, recordPoll } from "@/lib/poll-recording";
import { decideProviderStatus } from "@/lib/provider-status";
import { readAllProviders } from "@/lib/status-feed";
import { READ_TIMEOUT_MS } from "@/lib/status-feed/read-policy";
import { FEED_URLS } from "../helpers/feed-urls";

let current: MigratedDb;

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

let fetchMock: ReturnType<typeof vi.fn<FetchHandler>>;
const fetchedUrls = () => fetchMock.mock.calls.map(c => String(c[0]));

/** Faz as URLs que começam com `prefix` responderem com `handler`; as demais seguem saudáveis. */
function route(prefix: string, handler: FetchHandler) {
    const previous = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) => (String(url).startsWith(prefix) ? handler(String(url), init) : previous(url, init)));
}

const readAll = async () => readAllProviders(await readActiveCatalog(current.db));

/** Um Poll que responde, como o agendador grava: lê todos os Providers ativos e grava as leituras. */
async function poll() {
    const readings = await readAll();
    await recordPoll(current.db, readings);
    return readings.map(outcomeOf);
}

async function statusChecks(providerId: string): Promise<string[]> {
    const rows = await current.client.execute({
        sql: "SELECT status FROM status_checks WHERE provider_id = ? ORDER BY id",
        args: [providerId],
    });
    return rows.rows.map(r => String(r.status));
}

const ORACLE_STATUS_PAGE = "https://ocistatus.oraclecloud.com";
const ORACLE_LOGIN = "https://www.oracle.com/cloud/sign-in.html";

/** Faz os dois Probes da Oracle (status page e login) responderem com `handler`. */
function routeOracleProbes(handler: FetchHandler) {
    route(ORACLE_STATUS_PAGE, handler);
    route(ORACLE_LOGIN, handler);
}

const statuspageFixture = (name: string) => feedFixture("statuspage", name);

const CLOUDFLARE_FEED = "https://www.cloudflarestatus.com";
const HOSTINGER_FEED = "https://statuspage.hostinger.com";
const GITHUB_FEED = "https://www.githubstatus.com";

beforeEach(async () => {
    current = await createMigratedDb();
    fetchMock = vi.fn<FetchHandler>(async url => healthyResponse(String(url)));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("Poll guiado pelo Provider Catalog", () => {
    it("lê os 13 Providers ativos do catálogo e grava uma leitura de cada", async () => {
        const results = await poll();

        expect(results.map(r => r.providerId).sort()).toEqual([
            "aws", "azure", "cloudflare", "digital-ocean", "github", "google-cloud", "heroku",
            "hostinger", "ibm-cloud", "jira", "oracle-cloud", "salesforce", "vercel",
        ]);
        expect(await statusChecks("heroku")).toEqual(["operational"]);
    });

    it("um Provider inativo não é lido nem gravado em status_checks", async () => {
        await current.client.execute("UPDATE providers SET active = 0 WHERE id = 'vercel'");

        const results = await poll();

        expect(results.map(r => r.providerId)).not.toContain("vercel");
        expect(fetchedUrls().filter(u => u.includes("vercel"))).toEqual([]);
        expect(await statusChecks("vercel")).toEqual([]);
        expect(await statusChecks("github")).toEqual(["operational"]);
    });

    it("cada leitor recebe a URL do Feed vinda do catálogo", async () => {
        await current.client.execute(
            "UPDATE provider_sources SET url = 'https://status.example.test' WHERE id = 'cloudflare-feed'",
        );

        await poll();

        expect(fetchedUrls()).toContain("https://status.example.test/api/v2/summary.json");
        expect(fetchedUrls()).not.toContain("https://www.cloudflarestatus.com/api/v2/summary.json");
    });

    it("um Feed inativo não é lido", async () => {
        await current.client.execute("UPDATE provider_sources SET active = 0 WHERE id IN ('salesforce-feed', 'ibm-cloud-feed')");

        await poll();

        expect(fetchedUrls().filter(url => url.startsWith("https://api.status.salesforce.com/"))).toEqual([]);
        expect(fetchedUrls()).not.toContain("https://cloud.ibm.com/status/api/notifications/feed.rss");
    });

    it("Salesforce e IBM são lidas pelos Feeds, sem a marca de \"só acesso\", e a Oracle segue só com Probes", async () => {
        const results = await poll();

        expect(fetchedUrls()).toContain("https://api.status.salesforce.com/v1/incidents/active");
        expect(fetchedUrls()).toContain("https://cloud.ibm.com/status/api/notifications/feed.rss");
        for (const id of ["salesforce", "ibm-cloud"]) {
            expect(results.find(r => r.providerId === id)).toMatchObject({ status: "operational", incidents: [] });
            expect(results.find(r => r.providerId === id)?.accessOnly).toBeFalsy();
        }
        expect(results.find(r => r.providerId === "oracle-cloud")?.accessOnly).toBe(true);
    });

    it("um Feed de família desconhecida vira Feed não lido, com registro no log, sem derrubar o Poll", async () => {
        await current.client.execute("UPDATE provider_sources SET family = 'atom-v9' WHERE id = 'heroku-feed'");

        const results = await poll();

        expect(results.find(r => r.providerId === "heroku")?.status).toBe("unreachable");
        expect(await statusChecks("heroku")).toEqual(["unreachable"]);
        expect(fetchedUrls()).not.toContain(FEED_URLS.heroku);
        expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/heroku-feed.*atom-v9/));
        expect(await statusChecks("aws")).toEqual(["operational"]);
    });

    it("os Probes rodam para todos os Providers ativos, com ou sem Feed, e os resultados vêm com a leitura", async () => {
        const readings = await readAll();

        expect(fetchedUrls()).toEqual(
            expect.arrayContaining(["https://dash.cloudflare.com", "https://github.com/login", ORACLE_LOGIN]),
        );
        for (const reading of readings) expect(reading.probes).toEqual([true, true]);
    });

    it("um Probe inativo não roda, nem o de Provider inativo", async () => {
        await current.client.execute("UPDATE provider_sources SET active = 0 WHERE id = 'cloudflare-login'");
        await current.client.execute("UPDATE providers SET active = 0 WHERE id = 'github'");

        await readAll();

        expect(fetchedUrls()).not.toContain("https://dash.cloudflare.com");
        expect(fetchedUrls()).not.toContain("https://github.com/login");
    });
});

describe("política de leitura no Poll: cada fonte é independente", () => {
    it("uma status page em timeout vira Unreachable, e os outros Providers saem com a leitura deles no mesmo Poll", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        route(CLOUDFLARE_FEED, hang);
        let results: ReturnType<typeof outcomeOf>[] | undefined;

        const reading = readAll().then(r => (results = r.map(outcomeOf)));
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
        expect(results).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        await reading;

        expect(results?.find(r => r.providerId === "cloudflare")?.status).toBe("unreachable");
        expect(results?.find(r => r.providerId === "github")?.status).toBe("operational");
        expect(results?.find(r => r.providerId === "aws")?.status).toBe("operational");
        expect(results?.find(r => r.providerId === "oracle-cloud")?.status).toBe("operational");
    });

    it("as fontes são lidas ao mesmo tempo: a que trava não segura as outras", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        route(CLOUDFLARE_FEED, hang);

        const reading = readAll();
        await vi.advanceTimersByTimeAsync(0);

        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/github-feed lida em \d+ ms/));

        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
        await reading;
    });

    it("um Feed com resposta 5xx vira Unreachable, nunca Outage, e não afeta os demais", async () => {
        route(CLOUDFLARE_FEED, async () => new Response("oops", { status: 503 }));

        await poll();

        expect(await statusChecks("cloudflare")).toEqual(["unreachable"]);
        expect(await statusChecks("github")).toEqual(["operational"]);
    });

    it("um Feed com conteúdo fora do formato vira Unreachable, com registro no log", async () => {
        route(CLOUDFLARE_FEED, async () => Response.json({ page: {}, status: {} }));

        await poll();

        expect(await statusChecks("cloudflare")).toEqual(["unreachable"]);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining("cloudflare-feed"), expect.anything());
    });

    it("um Feed não lido não encerra os Incidents já gravados do Provider", async () => {
        await current.client.execute(
            "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES ('inc-1', 'cloudflare', 'Open issue', 'investigating', 'problem')",
        );
        route(CLOUDFLARE_FEED, async () => new Response("oops", { status: 503 }));

        await poll();

        const row = await current.client.execute("SELECT status FROM incidents WHERE id = 'inc-1'");
        expect(row.rows[0].status).toBe("investigating");
    });

    it("o tempo de resposta não é gravado com a leitura", async () => {
        await poll();

        const rows = await current.client.execute("SELECT DISTINCT response_time FROM status_checks");
        expect(rows.rows.map(r => r.response_time)).toEqual([null]);
    });

    it("os payloads reais gravados atravessam o Poll até o banco, com estado e Incidents", async () => {
        route(CLOUDFLARE_FEED, async () => new Response(statuspageFixture("cloudflare-major.json")));
        route(HOSTINGER_FEED, async () => new Response(statuspageFixture("hostinger-incident.json")));

        const results = await poll();

        expect(results.find(r => r.providerId === "cloudflare")?.incidents.every(i => i.sourceId === "cloudflare-feed")).toBe(true);
        expect(await statusChecks("cloudflare")).toEqual(["outage"]);
        expect(await statusChecks("hostinger")).toEqual(["operational"]);
        const rows = await current.client.execute(
            "SELECT kind, status FROM incidents WHERE provider_id = 'hostinger' AND title LIKE 'PHP Security Update%'",
        );
        expect(rows.rows[0]).toMatchObject({ kind: "problem", status: "monitoring" });
    });
});

describe("Provider com vários Feeds (catálogo montado no teste)", () => {
    const SECOND_FEED = "https://second-feed.example.test";
    const statuspage = (indicator: string, incidents: { id: string; name: string }[] = []) =>
        Response.json({
            status: { indicator },
            incidents: incidents.map(i => ({
                ...i,
                status: "investigating",
                shortlink: "https://stspg.io/x",
                created_at: "2026-10-30T10:00:00Z",
                updated_at: "2026-10-30T10:00:00Z",
                resolved_at: null,
                incident_updates: [],
            })),
            scheduled_maintenances: [],
        });

    beforeEach(async () => {
        await current.client.execute(`INSERT INTO provider_sources (id, provider_id, kind, family, url, label, active)
            VALUES ('github-feed-2', 'github', 'feed', 'statuspage', '${SECOND_FEED}', 'feed', 1)`);
    });

    async function githubDecision() {
        const now = new Date();
        const { providers } = await readSnapshot(current.db, now);
        const entry = providers.find(e => e.provider.id === "github")!;
        return decideProviderStatus({ ...entry.reading, now });
    }

    it("os dois Feeds são lidos, e cada um chega ao módulo de Provider Status", async () => {
        await poll();

        expect(fetchedUrls()).toContain(`${SECOND_FEED}/api/v2/summary.json`);
        expect(await statusChecks("github")).toEqual(["operational", "operational"]);
        expect(await githubDecision()).toMatchObject({ status: "operational", partialReading: null });
    });

    it("dois Feeds com estados diferentes: da leitura gravada até a decisão vence o pior, e os Incidents se somam", async () => {
        route(GITHUB_FEED, async () => statuspage("minor", [{ id: "a", name: "Do primeiro Feed" }]));
        route(SECOND_FEED, async () => statuspage("critical", [{ id: "b", name: "Do segundo Feed" }]));

        const [github] = (await poll()).filter(r => r.providerId === "github");

        expect(github.status).toBe("outage");
        expect(github.incidents.map(i => i.sourceId).sort()).toEqual(["github-feed", "github-feed-2"]);
        const decision = await githubDecision();
        expect(decision).toMatchObject({ status: "outage", partialReading: null });
        expect(decision.incidents.map(i => i.title).sort()).toEqual(["Do primeiro Feed", "Do segundo Feed"]);
    });

    it("um Feed lido e outro não: a Partial Reading chega à decisão da página, com o estado do lido", async () => {
        route(GITHUB_FEED, async () => statuspage("minor"));
        route(SECOND_FEED, async () => new Response("oops", { status: 503 }));

        await poll();

        expect(await statusChecks("github")).toEqual(["degraded", "unreachable"]);
        expect(await githubDecision()).toMatchObject({ status: "degraded", partialReading: { unread: 1, total: 2 } });
    });

    it("com o Feed lido em segundo lugar, a Partial Reading vem igual", async () => {
        route(GITHUB_FEED, async () => { throw new TypeError("fetch failed"); });
        route(SECOND_FEED, async () => statuspage("critical", [{ id: "b", name: "Do Feed lido" }]));

        await poll();

        const decision = await githubDecision();
        expect(decision).toMatchObject({ status: "outage", partialReading: { unread: 1, total: 2 } });
        expect(decision.incidents.map(i => i.title)).toEqual(["Do Feed lido"]);
    });

    it("nenhum Feed lido é Unreachable, sem a marca, mesmo com os Probes respondendo", async () => {
        route(GITHUB_FEED, async () => new Response("oops", { status: 503 }));
        route(SECOND_FEED, async () => new Response("oops", { status: 503 }));

        await poll();

        expect(await githubDecision()).toMatchObject({ status: "unreachable", partialReading: null });
    });

    it("o Poll seguinte, com os dois Feeds lidos, tira a marca", async () => {
        route(SECOND_FEED, async () => new Response("oops", { status: 503 }));
        await poll();
        await current.client.execute({
            sql: "UPDATE status_checks SET checked_at = ?",
            args: [Math.floor(Date.now() / 1000) - 300],
        });

        route(SECOND_FEED, async () => statuspage("none"));
        await poll();

        expect(await githubDecision()).toMatchObject({ status: "operational", partialReading: null });
    });

    it("sob Partial Reading, o Incident gravado do Feed não lido não é encerrado, e o do Feed lido é gravado", async () => {
        await current.client.execute(
            "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES ('inc-1', 'github', 'Do Feed não lido', 'investigating', 'problem')",
        );
        route(GITHUB_FEED, async () => statuspage("minor", [{ id: "a", name: "Do Feed lido" }]));
        route(SECOND_FEED, async () => new Response("oops", { status: 503 }));

        await poll();

        const rows = await current.client.execute("SELECT title, status FROM incidents WHERE provider_id = 'github' ORDER BY title");
        expect(rows.rows.map(r => [r.title, r.status])).toEqual([
            ["Do Feed lido", "investigating"],
            ["Do Feed não lido", "investigating"],
        ]);
    });

    it("com os dois Feeds lidos, o Incident que saiu de ambos é encerrado", async () => {
        await current.client.execute(
            "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES ('inc-1', 'github', 'Saiu do Feed', 'investigating', 'problem')",
        );

        await poll();

        const row = await current.client.execute("SELECT status FROM incidents WHERE id = 'inc-1'");
        expect(row.rows[0].status).toBe("resolved");
    });
});

describe("Probes ao lado dos Feeds", () => {
    const CLOUDFLARE_LOGIN = "https://dash.cloudflare.com";

    it("um Probe que trava não atrasa o Feed do mesmo Provider, e o Poll termina no timeout", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        route(CLOUDFLARE_LOGIN, hang);
        let finished = false;

        const reading = readAll().then(r => {
            finished = true;
            return r;
        });
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
        expect(finished).toBe(false);
        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/cloudflare-feed lida em \d+ ms/));

        await vi.advanceTimersByTimeAsync(1);
        const cloudflare = (await reading).find(r => r.providerId === "cloudflare");

        expect(cloudflare?.feeds).toEqual([{ read: true, declared: "operational", incidents: [] }]);
        expect(cloudflare?.probes).toEqual([false, true]);
    });

    it("Probe sem resposta não muda o estado declarado pelo Feed lido", async () => {
        route(CLOUDFLARE_LOGIN, async () => { throw new TypeError("fetch failed"); });

        await poll();

        expect(await statusChecks("cloudflare")).toEqual(["operational"]);
    });
});

describe("Poll sem resposta de nenhuma fonte é descartado", () => {
    const discarded = expect.stringContaining("Poll descartado");
    const totalChecks = async () => (await current.client.execute("SELECT count(*) AS n FROM status_checks")).rows[0].n;

    /** A rede inteira responde com `handler`. */
    const everySource = (handler: FetchHandler) => fetchMock.mockImplementation(handler);

    it("sem rede: nada é gravado, o problema vai ao log e os Incidents ficam como estavam", async () => {
        await current.client.execute(
            "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES ('inc-1', 'aws', 'Open issue', 'investigating', 'problem')",
        );
        everySource(async () => { throw new TypeError("fetch failed"); });

        await runPoll(current.db);

        expect(await totalChecks()).toBe(0);
        expect(console.error).toHaveBeenCalledWith(discarded);
        const row = await current.client.execute("SELECT status FROM incidents WHERE id = 'inc-1'");
        expect(row.rows[0].status).toBe("investigating");
    });

    it("toda fonte em timeout é sem resposta", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        everySource(hang);

        const job = runPoll(current.db);
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
        await job;

        expect(await totalChecks()).toBe(0);
        expect(console.error).toHaveBeenCalledWith(discarded);
    });

    it("toda fonte com 5xx é sem resposta, a mesma regra dos Probes", async () => {
        everySource(async () => new Response("oops", { status: 503 }));

        await runPoll(current.db);

        expect(await totalChecks()).toBe(0);
        expect(console.error).toHaveBeenCalledWith(discarded);
    });

    it("o Snapshot do último Poll respondido continua o mesmo", async () => {
        await poll();
        const before = await totalChecks();
        const { lastPollAt } = await readSnapshot(current.db, new Date());
        everySource(async () => { throw new TypeError("fetch failed"); });

        await runPoll(current.db);

        expect(await totalChecks()).toBe(before);
        expect((await readSnapshot(current.db, new Date())).lastPollAt).toEqual(lastPollAt);
    });

    it("o Poll gravado só com os Probes de Providers com Feed respondendo renova a hora do último Poll", async () => {
        const before = Date.now();
        everySource(async url => {
            if (String(url) === "https://dash.cloudflare.com") return new Response(null, { status: 302 });
            throw new TypeError("fetch failed");
        });

        await runPoll(current.db);

        expect(await statusChecks("cloudflare")).toEqual(["unreachable"]);
        const { lastPollAt } = await readSnapshot(current.db, new Date());
        expect(lastPollAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it("basta um Probe de um Provider responder: o Poll é gravado", async () => {
        everySource(async url => {
            if (String(url) === ORACLE_LOGIN) return new Response(null, { status: 302 });
            throw new TypeError("fetch failed");
        });

        await runPoll(current.db);

        expect(console.error).not.toHaveBeenCalledWith(discarded);
        expect(await statusChecks("oracle-cloud")).toEqual(["operational"]);
        expect(await statusChecks("aws")).toEqual(["unreachable"]);
    });

    it("um Feed com HTTP 200 fora do formato respondeu: o Poll é gravado, com o Feed não lido", async () => {
        everySource(async url => {
            if (String(url).startsWith(CLOUDFLARE_FEED)) return new Response("<html>não é JSON</html>");
            throw new TypeError("fetch failed");
        });

        await runPoll(current.db);

        expect(console.error).not.toHaveBeenCalledWith(discarded);
        expect(await statusChecks("cloudflare")).toEqual(["unreachable"]);
    });

    it("toda fonte com 404 respondeu: o Poll é gravado, com os Feeds não lidos e os Probes de pé", async () => {
        everySource(async () => new Response("não encontrado", { status: 404 }));

        await runPoll(current.db);

        expect(console.error).not.toHaveBeenCalledWith(discarded);
        expect(await statusChecks("aws")).toEqual(["unreachable"]);
        expect(await statusChecks("oracle-cloud")).toEqual(["operational"]);
    });

    it("sem nenhuma fonte ativa não é falha do monitor", async () => {
        await current.client.execute("UPDATE provider_sources SET active = 0");

        await runPoll(current.db);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(console.error).not.toHaveBeenCalledWith(discarded);
        expect(await statusChecks("aws")).toEqual(["unreachable"]);
    });

    it("com o catálogo vazio não é falha do monitor", async () => {
        await current.client.execute("UPDATE providers SET active = 0");

        await runPoll(current.db);

        expect(console.error).not.toHaveBeenCalledWith(discarded);
        expect(await totalChecks()).toBe(0);
    });
});

describe("Probes de Providers sem Feed ativo", () => {
    it("Providers sem Feed ativo rodam os Probes da status page e do login e ficam Operational quando respondem", async () => {
        await current.client.execute("UPDATE provider_sources SET active = 0 WHERE id IN ('salesforce-feed', 'ibm-cloud-feed')");

        const results = await poll();

        expect(fetchedUrls()).toEqual(
            expect.arrayContaining([
                ORACLE_STATUS_PAGE, ORACLE_LOGIN,
                "https://status.salesforce.com", "https://login.salesforce.com",
                "https://cloud.ibm.com/status", "https://cloud.ibm.com/login",
            ]),
        );
        for (const id of ["oracle-cloud", "salesforce", "ibm-cloud"]) {
            expect(results.find(r => r.providerId === id)).toMatchObject({ status: "operational", incidents: [], accessOnly: true });
            expect(await statusChecks(id)).toEqual(["operational"]);
        }
    });

    it.each([200, 302, 403, 404, 499])("resposta %i conta como de pé", async code => {
        routeOracleProbes(async () => new Response(null, { status: code }));

        await poll();

        expect(await statusChecks("oracle-cloud")).toEqual(["operational"]);
    });

    it.each([500, 503])("resposta %i conta como falha", async code => {
        routeOracleProbes(async () => new Response(null, { status: code }));

        await poll();

        expect(await statusChecks("oracle-cloud")).toEqual(["unreachable"]);
    });

    it("erro de rede conta como falha", async () => {
        routeOracleProbes(async () => { throw new TypeError("fetch failed"); });

        await poll();

        expect(await statusChecks("oracle-cloud")).toEqual(["unreachable"]);
    });

    it("timeout conta como falha", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        routeOracleProbes(hang);

        const polling = poll();
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
        await polling;

        expect(await statusChecks("oracle-cloud")).toEqual(["unreachable"]);
    });

    it("basta um Probe responder: status page com 503 e login com 302 deixam o Provider de pé", async () => {
        route(ORACLE_STATUS_PAGE, async () => new Response(null, { status: 503 }));
        route(ORACLE_LOGIN, async () => new Response(null, { status: 302, headers: { location: "/login" } }));

        await poll();

        expect(await statusChecks("oracle-cloud")).toEqual(["operational"]);
    });

    it("Probes não declaram Incidents: um Incident já gravado do Provider continua como estava", async () => {
        await current.client.execute(
            "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES ('inc-1', 'oracle-cloud', 'Old issue', 'investigating', 'problem')",
        );

        await poll();

        const row = await current.client.execute("SELECT status FROM incidents WHERE id = 'inc-1'");
        expect(row.rows[0].status).toBe("investigating");
    });
});
