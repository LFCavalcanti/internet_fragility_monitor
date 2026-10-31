// @vitest-environment node
/**
 * Leitura do Snapshot guiada pelo Provider Catalog, no banco real das migrations (SQLite em memória).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMigratedDb, type MigratedDb } from "../helpers/migrated-db";

import { snapshotIncidentsOf } from "../helpers/status-feed";
import { readSnapshot } from "@/lib/poll-recording";
import { decideProviderStatus } from "@/lib/provider-status";
import { decideInternetHealth } from "@/lib/internet-health";
import { hoursBefore } from "../helpers/time";

let current: MigratedDb;

const now = new Date("2026-10-28T12:00:00Z");

/** Instante como o Drizzle grava as colunas `timestamp`: segundos desde a época. */
const seconds = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);

interface IncidentRow {
    providerId: string;
    title: string;
    status: string;
    kind?: "problem" | "maintenance";
    createdAt: Date;
    resolvedAt?: Date | null;
    scheduledFor?: Date | null;
}

let incidentSeq = 0;
function insertIncident({ providerId, title, status, kind = "problem", createdAt, resolvedAt = null, scheduledFor = null }: IncidentRow) {
    return current.client.execute({
        sql: `INSERT INTO incidents (id, provider_id, title, status, kind, created_at, updated_at, resolved_at, scheduled_for)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            `inc-${++incidentSeq}`, providerId, title, status, kind,
            seconds(createdAt), seconds(createdAt), seconds(resolvedAt), seconds(scheduledFor),
        ],
    });
}

const activeProviders = async () => (await readSnapshot(current.db, now)).providers;

async function snapshotOf(providerId: string) {
    return (await activeProviders()).find(e => e.provider.id === providerId)!;
}

async function decisionFor(providerId: string) {
    return decideProviderStatus({ ...(await snapshotOf(providerId)).reading, now });
}

describe("readSnapshot lê o Provider Catalog", () => {
    beforeEach(async () => {
        current = await createMigratedDb();
    });

    it("traz os 13 Providers ativos na ordem de exibição, com nome, logo, status page e marcação de Major Provider", async () => {
        const snapshot = await activeProviders();

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

        const snapshot = await activeProviders();

        expect(snapshot.map(e => e.provider.id)).not.toContain("vercel");
        expect(snapshot).toHaveLength(12);
        const kept = await current.client.execute("SELECT count(*) AS n FROM status_checks WHERE provider_id = 'vercel'");
        expect(kept.rows[0].n).toBe(1);
    });

    it("segue a ordem de exibição do catálogo, não a de inserção", async () => {
        await current.client.execute("UPDATE providers SET display_order = 0 WHERE id = 'heroku'");

        const snapshot = await activeProviders();

        expect(snapshot[0].provider.id).toBe("heroku");
    });

    it("traz a leitura mais recente de cada Provider junto com ele", async () => {
        await current.client.execute({
            sql: "INSERT INTO status_checks (provider_id, status, checked_at) VALUES ('cloudflare', 'degraded', ?)",
            args: [Math.floor(now.getTime() / 1000) - 60],
        });

        const snapshot = await activeProviders();

        expect(snapshot.find(e => e.provider.id === "cloudflare")?.reading.feeds).toEqual([
            { read: true, declared: "degraded", incidents: [] },
        ]);
    });

    it("traz as leituras de cada Feed do último Poll, na ordem gravada, e nenhuma de um Poll anterior", async () => {
        const checkedAt = Math.floor(now.getTime() / 1000) - 60;
        const check = (status: string, at: number) =>
            current.client.execute({
                sql: "INSERT INTO status_checks (provider_id, status, checked_at) VALUES ('github', ?, ?)",
                args: [status, at],
            });
        await check("outage", checkedAt - 300);
        await check("outage", checkedAt - 300);
        await check("degraded", checkedAt);
        await check("unreachable", checkedAt);

        const { reading, lastUpdated } = await snapshotOf("github");

        expect(reading.feeds).toEqual([
            { read: true, declared: "degraded", incidents: [] },
            { read: false, incidents: [] },
        ]);
        expect(lastUpdated).toEqual(new Date(checkedAt * 1000));
    });

    it("um Provider sem leitura gravada vem Operational", async () => {
        const { reading, lastUpdated } = await snapshotOf("aws");

        expect(reading.feeds).toEqual([{ read: true, declared: "operational", incidents: [] }]);
        expect(lastUpdated).toBeUndefined();
    });

    it("um Provider sem logo nem status page no catálogo vem com os campos ausentes, não nulos", async () => {
        await current.client.execute("UPDATE providers SET logo = NULL, status_page_url = NULL WHERE id = 'heroku'");

        const { provider } = await snapshotOf("heroku");

        expect(provider.logo).toBeUndefined();
        expect(provider.statusPageUrl).toBeUndefined();
    });
});

describe("Incidents do Snapshot", () => {
    beforeEach(async () => {
        current = await createMigratedDb();
    });

    it("traz a falha de leitura como unreachable, com os Incidents gravados", async () => {
        await current.client.execute({
            sql: "INSERT INTO status_checks (provider_id, status, checked_at) VALUES ('aws', 'unreachable', ?)",
            args: [seconds(hoursBefore(now, 0.1))],
        });
        await insertIncident({ providerId: "aws", title: "Elevated errors", status: "identified", createdAt: hoursBefore(now, 1) });

        const entry = await snapshotOf("aws");

        expect(entry.reading.feeds[0].read).toBe(false);
        expect(snapshotIncidentsOf(entry)).toEqual([
            expect.objectContaining({ kind: "problem", title: "Elevated errors", status: "identified" }),
        ]);
    });

    it("traz todos os Incidents ativos, sem corte por quantidade, e só os resolvidos dentro de 48 horas da resolução", async () => {
        const active = Array.from({ length: 10 }, (_, i) => `Active ${i}`);
        for (const [i, title] of active.entries()) {
            await insertIncident({ providerId: "aws", title, status: "investigating", createdAt: hoursBefore(now, 24 * (i + 1)) });
        }
        await insertIncident({
            providerId: "aws", title: "Resolved 47h", status: "resolved",
            createdAt: hoursBefore(now, 24 * 10), resolvedAt: hoursBefore(now, 47),
        });
        await insertIncident({
            providerId: "aws", title: "Resolved 49h", status: "resolved",
            createdAt: hoursBefore(now, 50), resolvedAt: hoursBefore(now, 49),
        });
        await insertIncident({ providerId: "aws", title: "Resolved sem hora, criado há 30h", status: "resolved", createdAt: hoursBefore(now, 30) });
        await insertIncident({ providerId: "aws", title: "Resolved sem hora, criado há 72h", status: "resolved", createdAt: hoursBefore(now, 72) });

        const incidents = snapshotIncidentsOf(await snapshotOf("aws"));

        expect(incidents.map(i => i.title).sort()).toEqual(
            [...active, "Resolved 47h", "Resolved sem hora, criado há 30h"].sort(),
        );
        expect(incidents.find(i => i.title === "Resolved 47h")?.resolvedAt).toEqual(hoursBefore(now, 47));
    });

    it("traz todas as manutenções agendadas e em andamento, sem corte por quantidade, e omite as completed", async () => {
        for (let i = 0; i < 25; i++) {
            await insertIncident({
                providerId: "cloudflare", title: `maintenance ${i}`, status: "scheduled", kind: "maintenance",
                createdAt: hoursBefore(now, 48), scheduledFor: new Date(Date.UTC(2026, 9, 29, i)),
            });
        }
        await insertIncident({
            providerId: "cloudflare", title: "in progress", status: "in_progress", kind: "maintenance",
            createdAt: hoursBefore(now, 48), scheduledFor: hoursBefore(now, 2),
        });
        await insertIncident({
            providerId: "cloudflare", title: "completed", status: "completed", kind: "maintenance",
            createdAt: hoursBefore(now, 48), scheduledFor: hoursBefore(now, 30), resolvedAt: hoursBefore(now, 1),
        });
        await insertIncident({ providerId: "cloudflare", title: "problem", status: "identified", createdAt: hoursBefore(now, 3) });

        const incidents = snapshotIncidentsOf(await snapshotOf("cloudflare"));

        expect(incidents.filter(i => i.kind === "maintenance" && i.status === "scheduled")).toHaveLength(25);
        expect(incidents.filter(i => i.kind === "maintenance" && i.status === "in_progress")).toHaveLength(1);
        expect(incidents.some(i => i.kind === "maintenance" && i.status === "completed")).toBe(false);
        expect(incidents.find(i => i.kind === "problem")).toMatchObject({ title: "problem", status: "identified" });
        expect(incidents.find(i => i.title === "maintenance 0")).toMatchObject({
            kind: "maintenance",
            scheduledFor: new Date(Date.UTC(2026, 9, 29, 0)),
        });
    });
});

describe("Hora do último Poll vai ao Internet Health", () => {
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);

    beforeEach(async () => {
        current = await createMigratedDb();
    });

    const recordedAt = (status: string, at: Date, providerId = "aws") =>
        current.client.execute({
            sql: "INSERT INTO status_checks (provider_id, status, checked_at) VALUES (?, ?, ?)",
            args: [providerId, status, seconds(at)],
        });

    async function hero() {
        const { providers, lastPollAt } = await readSnapshot(current.db, now);
        const statuses = providers.map(entry => ({ ...entry, decision: decideProviderStatus({ ...entry.reading, now }) }));
        return { lastPollAt, health: decideInternetHealth({ providers: statuses, lastPollAt, now }) };
    }

    it("é a leitura mais recente, entre os Providers", async () => {
        await recordedAt("operational", minutesAgo(9));
        await recordedAt("outage", minutesAgo(4), "azure");

        expect((await hero()).lastPollAt).toEqual(minutesAgo(4));
    });

    it("um Poll gravado com todos Unreachable há 1 minuto vale: a hora é a real e o Snapshot não fica Stale", async () => {
        await recordedAt("unreachable", minutesAgo(1));
        await recordedAt("unreachable", minutesAgo(1), "azure");

        const { lastPollAt, health } = await hero();

        expect(lastPollAt).toEqual(minutesAgo(1));
        expect(health.status).toBe("Healthy");
    });

    it("sem Poll gravado há 16 minutos, porque os seguintes foram descartados: Stale Snapshot com a hora do último", async () => {
        await recordedAt("outage", minutesAgo(16));

        expect((await hero()).health).toEqual({ status: "Stale", lastPollAt: minutesAgo(16) });
    });

    it("sem nenhum Poll gravado: Stale Snapshot, sem hora", async () => {
        expect((await hero()).health).toEqual({ status: "Stale", lastPollAt: null });
    });

    it("a leitura de um Provider inativo não renova a hora", async () => {
        await recordedAt("operational", minutesAgo(30));
        await recordedAt("operational", minutesAgo(1), "vercel");
        await current.client.execute("UPDATE providers SET active = 0 WHERE id = 'vercel'");

        expect((await hero()).lastPollAt).toEqual(minutesAgo(30));
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

    it("a Oracle, sem Feed ativo, fica Operational com a marca de \"só acesso\" quando um Probe respondeu", async () => {
        await checkedAgo("oracle-cloud", "operational");

        expect(await decisionFor("oracle-cloud")).toMatchObject({ status: "operational", accessOnly: true });
    });

    it.each(["salesforce", "ibm-cloud"])("%s, com o Feed ativo, perde a marca de \"só acesso\" e mostra o que o Feed declara", async id => {
        await checkedAgo(id, "degraded");

        expect(await decisionFor(id)).toMatchObject({ status: "degraded", accessOnly: false });
    });

    it("sem resposta de nenhum Probe, o Provider só com Probes fica Unreachable", async () => {
        await checkedAgo("oracle-cloud", "unreachable");

        expect(await decisionFor("oracle-cloud")).toMatchObject({ status: "unreachable", accessOnly: true });
    });

    it.each(["degraded", "outage"])(
        "um Provider só com Probes nunca aparece em %s, mesmo com uma leitura antiga dessas gravada",
        async status => {
            await checkedAgo("oracle-cloud", status);

            expect(await decisionFor("oracle-cloud")).toMatchObject({ status: "operational", accessOnly: true });
        },
    );

    it("um Provider só com Probes nunca aparece em Maintenance, mesmo com manutenção em andamento gravada", async () => {
        await checkedAgo("oracle-cloud", "operational");
        await current.client.execute(
            "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES ('m-1', 'oracle-cloud', 'Old maintenance', 'in_progress', 'maintenance')",
        );

        expect((await decisionFor("oracle-cloud")).status).toBe("operational");
    });

    it("um Provider com Feed ativo continua decidido pelo Feed, sem a marca", async () => {
        await checkedAgo("cloudflare", "degraded");

        expect(await decisionFor("cloudflare")).toMatchObject({ status: "degraded", accessOnly: false });
    });

    it("um Feed com falha de leitura vai como não lido, com os Incidents gravados", async () => {
        await checkedAgo("cloudflare", "unreachable");

        expect(await decisionFor("cloudflare")).toMatchObject({ status: "unreachable", accessOnly: false });
    });

    it("com dois Feeds lidos e manutenção em andamento gravada, o estado sai igual ao de cada Feed com os seus Incidents", async () => {
        await checkedAgo("cloudflare", "operational");
        await checkedAgo("cloudflare", "operational");
        await current.client.execute(
            "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES ('m-1', 'cloudflare', 'Network upgrade', 'in_progress', 'maintenance')",
        );

        expect((await decisionFor("cloudflare")).status).toBe("maintenance");
    });

    it("manutenção em andamento gravada não esconde o Degraded de outro Feed lido, em qualquer ordem", async () => {
        await current.client.execute(
            "INSERT INTO incidents (id, provider_id, title, status, kind) VALUES ('m-1', 'cloudflare', 'Network upgrade', 'in_progress', 'maintenance')",
        );
        await checkedAgo("cloudflare", "operational");
        await checkedAgo("cloudflare", "degraded");

        expect((await decisionFor("cloudflare")).status).toBe("degraded");
    });

    it("quando nenhum Feed foi lido, os Incidents gravados continuam no card", async () => {
        await checkedAgo("cloudflare", "unreachable");
        await checkedAgo("cloudflare", "unreachable");
        await insertIncident({ providerId: "cloudflare", title: "Open issue", status: "identified", createdAt: hoursBefore(now, 1) });

        const decision = await decisionFor("cloudflare");

        expect(decision).toMatchObject({ status: "unreachable", partialReading: null });
        expect(decision.incidents.map(i => i.title)).toEqual(["Open issue"]);
    });

    it("quando o Feed de um Provider é desativado, ele passa a ser um Provider só com Probes", async () => {
        await checkedAgo("heroku", "operational");
        await current.client.execute("UPDATE provider_sources SET active = 0 WHERE id = 'heroku-feed'");

        expect(await decisionFor("heroku")).toMatchObject({ status: "operational", accessOnly: true });
    });
});
