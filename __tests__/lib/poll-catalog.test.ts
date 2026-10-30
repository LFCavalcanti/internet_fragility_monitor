// @vitest-environment node
/**
 * Poll guiado pelo Provider Catalog, no banco real das migrations (SQLite em memória).
 * A rede é a única coisa simulada: cada URL responde como o Feed ou o Probe de verdade responderia.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMigratedDb, type MigratedDb } from "../helpers/migrated-db";

let current: MigratedDb;
vi.mock("@/lib/db", () => ({ getDb: () => current.db }));

import { fetchAllStatuses } from "@/lib/fetchers";
import { saveStatusResult } from "@/lib/db-service";
import { PROBE_TIMEOUT_MS } from "@/lib/fetchers/probe";

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

/** Resposta de cada Feed real com tudo funcionando; qualquer outra URL é um Probe que responde 200. */
function healthyResponse(url: string): Response {
    if (url.endsWith("/api/v2/summary.json")) {
        return Response.json({ status: { indicator: "none" }, incidents: [], scheduled_maintenances: [] });
    }
    if (url.endsWith("incidents.json")) return Response.json([]);
    if (url.includes("/api/v4/current-status")) {
        return Response.json({ status: [{ system: "Apps", status: "green" }], incidents: [] });
    }
    if (url.endsWith(".rss") || url.endsWith("/feed/")) {
        return new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>Status</title></channel></rss>');
    }
    return new Response("ok", { status: 200 });
}

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
        await poll();

        expect(fetchedUrls()).not.toContain("https://api.status.salesforce.com/v1");
        expect(fetchedUrls()).not.toContain("https://cloud.ibm.com/status/api/notifications/feed.rss");
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

describe("Probes de Providers sem Feed ativo", () => {
    it("Oracle, Salesforce e IBM rodam os Probes da status page e do login e ficam Operational quando respondem", async () => {
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
        const hang: FetchHandler = (_url, init) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
            });
        routeOracleProbes(hang);

        const polling = poll();
        await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
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
