// @vitest-environment node
/**
 * Poll guiado pelo Provider Catalog, no banco real das migrations (SQLite em memória).
 * A rede é a única coisa simulada: cada URL responde como o Feed ou o Probe de verdade responderia.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMigratedDb, type MigratedDb } from "../helpers/migrated-db";
import { feedFixture, hang, healthyResponse } from "../helpers/status-feed";

let current: MigratedDb;
vi.mock("@/lib/db", () => ({ getDb: () => current.db }));

import { fetchAllStatuses } from "@/lib/status-feed";
import { saveStatusResult } from "@/lib/db-service";
import { READ_TIMEOUT_MS } from "@/lib/status-feed/read-policy";

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

let fetchMock: ReturnType<typeof vi.fn<FetchHandler>>;
const fetchedUrls = () => fetchMock.mock.calls.map(c => String(c[0]));

/** Faz as URLs que começam com `prefix` responderem com `handler`; as demais seguem saudáveis. */
function route(prefix: string, handler: FetchHandler) {
    const previous = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, init) => (String(url).startsWith(prefix) ? handler(String(url), init) : previous(url, init)));
}

/** Um Poll como o cron roda: lê todos os Providers ativos e grava cada resultado. */
async function poll() {
    const results = await fetchAllStatuses();
    for (const result of results) await saveStatusResult(result);
    return results;
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
        expect(fetchedUrls().filter(u => u.includes("heroku"))).toEqual([]);
        expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/heroku-feed.*atom-v9/));
        expect(await statusChecks("aws")).toEqual(["operational"]);
    });

    it("os Probes de Providers com Feed ativo ainda não rodam", async () => {
        await poll();

        expect(fetchedUrls()).not.toContain("https://dash.cloudflare.com");
        expect(fetchedUrls()).not.toContain("https://github.com/login");
    });
});

describe("política de leitura no Poll: cada fonte é independente", () => {
    it("uma status page em timeout vira Unreachable, e os outros Providers saem com a leitura deles no mesmo Poll", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        route(CLOUDFLARE_FEED, hang);
        let results: Awaited<ReturnType<typeof fetchAllStatuses>> | undefined;

        const reading = fetchAllStatuses().then(r => (results = r));
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

        const reading = fetchAllStatuses();
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
