// @vitest-environment node
/**
 * Famílias Salesforce e RSS da IBM pela interface do módulo de Status Feed: o catálogo é o das migrations reais, e a
 * rede é a única coisa simulada. As fixtures são payloads reais gravados (coleta nos Comments do Ticket 11).
 * Timeout, 5xx, erro de rede e conteúdo fora do formato estão em feed-families.test.ts, junto das outras famílias.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMigratedDb, type MigratedDb } from '../../helpers/migrated-db';
import { FEED_URLS } from '../../helpers/feed-urls';
import { feedFixture, healthyResponse, outcomeOf } from '../../helpers/status-feed';

let current: MigratedDb;
vi.mock('@/lib/db', () => ({ getDb: () => current.db }));

import { fetchAllStatuses } from '@/lib/status-feed';
import { getLatestStatus, saveStatusResult } from '@/lib/db-service';
import type { ReadIncident } from '@/lib/status-feed/types';

type Network = (url: string, init?: RequestInit) => Promise<Response>;

const routes: [prefix: string, answer: Network][] = [];
const respondWith = (prefix: string, body: string) => routes.unshift([prefix, async () => new Response(body)]);

const salesforceIncidents = () => JSON.parse(feedFixture('salesforce', 'incidents-active.json'));
const salesforceMaintenances = () => JSON.parse(feedFixture('salesforce', 'maintenances.json'));

async function readProvider(providerId: string) {
    const results = await fetchAllStatuses();
    const result = results.find(r => r.providerId === providerId);
    if (!result) throw new Error(`${providerId} fora do Poll`);
    return outcomeOf(result);
}

const byId = (incidents: ReadIncident[], externalId: string) => incidents.find(i => i.externalId === externalId);

/** RSS mínimo no formato da IBM. */
const ibmItem = ({
    title,
    guid = 'INC1',
    category = 'incident',
    footer = 'Outage Start: Wed Oct 21 2026 15:05:00 GMT+0000 <br /> Update Time: Thu Oct 22 2026 10:00:00 GMT+0000 <br />',
}: {
    title: string;
    guid?: string | null;
    category?: string | null;
    footer?: string;
}) => `<item><title><![CDATA[${title}]]></title><description><![CDATA[<p>Texto.</p> Type: incident <br /> ${footer}]]></description>
<link>https://cloud.ibm.com/status?query=${guid}</link>
${guid ? `<guid isPermaLink="false">${guid}</guid>` : ''}
${category ? `<category><![CDATA[${category}]]></category>` : ''}
<pubDate>Wed, 21 Oct 2026 12:49:38 GMT</pubDate></item>`;

const ibmRss = (...items: string[]) =>
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title><![CDATA[IBM Cloud Notifications]]></title>${items.join('')}</channel></rss>`;

beforeEach(async () => {
    current = await createMigratedDb();
    routes.length = 0;
    vi.stubGlobal(
        'fetch',
        vi.fn<Network>(async (url, init) => {
            const route = routes.find(([prefix]) => String(url).startsWith(prefix));
            return route ? route[1](String(url), init) : healthyResponse(String(url));
        }),
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Salesforce: incidentes ativos e manutenções', () => {
    beforeEach(() => {
        respondWith(FEED_URLS.salesforceIncidents, feedFixture('salesforce', 'incidents-active.json'));
        respondWith(FEED_URLS.salesforceMaintenances, feedFixture('salesforce', 'maintenances.json'));
    });

    it('payload real: o incidente ativo traz o id numérico como texto, a fonte e a atualização mais recente', async () => {
        const { incidents } = await readProvider('salesforce');

        const incident = byId(incidents, '20004549');
        expect(incident).toMatchObject({
            sourceId: 'salesforce-feed',
            kind: 'problem',
            status: 'investigating',
            title: 'Disruption #20004549',
            createdAt: new Date('2026-10-30T21:14:37.058Z'),
            updatedAt: new Date('2026-10-30T23:42:24.875Z'),
        });
        expect(incident?.description).toMatch(/^We've successfully applied a routing change/);
    });

    it('payload real: um impacto `major` aberto é Outage, e o Provider perde a marca de "só acesso"', async () => {
        const result = await readProvider('salesforce');

        expect(result.status).toBe('outage');
        expect(result.accessOnly).toBeFalsy();
    });

    it('um impacto `minor` aberto é Degraded', async () => {
        const incidents = salesforceIncidents();
        incidents[0].IncidentImpacts[0].severity = 'minor';
        respondWith(FEED_URLS.salesforceIncidents, JSON.stringify(incidents));

        expect((await readProvider('salesforce')).status).toBe('degraded');
    });

    it('um impacto `major` já encerrado não pesa: com o incidente ainda ativo, fica Degraded', async () => {
        const incidents = salesforceIncidents();
        incidents[0].IncidentImpacts[0].endTime = '2026-10-30T23:00:00.000Z';
        respondWith(FEED_URLS.salesforceIncidents, JSON.stringify(incidents));

        expect((await readProvider('salesforce')).status).toBe('degraded');
    });

    it('sem incidentes ativos: declara Operational, mesmo com manutenção em andamento', async () => {
        respondWith(FEED_URLS.salesforceIncidents, '[]');

        const { feeds, incidents } = await readProvider('salesforce');

        expect(feeds).toMatchObject([{ read: true, declared: 'operational' }]);
        expect(incidents.some(i => i.status === 'in_progress')).toBe(true);
    });

    it('payload real: a fase da manutenção vem do campo `status`, com o id numérico como texto', async () => {
        const { incidents } = await readProvider('salesforce');

        expect(byId(incidents, '20175289')).toMatchObject({
            sourceId: 'salesforce-feed',
            kind: 'maintenance',
            status: 'in_progress',
            title: 'Spiff Application Updates',
            scheduledFor: new Date('2026-10-30T18:00:00.000Z'),
            createdAt: new Date('2026-10-26T20:19:06.674Z'),
        });
        expect(byId(incidents, '20175321')).toMatchObject({
            kind: 'maintenance',
            status: 'scheduled',
            scheduledFor: new Date('2026-11-01T12:00:00.000Z'),
        });
    });

    it('payload real: a manutenção encerrada traz a hora de fim publicada no impacto', async () => {
        const { incidents } = await readProvider('salesforce');

        expect(byId(incidents, '20173265')).toMatchObject({
            kind: 'maintenance',
            status: 'completed',
            resolvedAt: new Date(salesforceMaintenances()[0].MaintenanceImpacts[0].endTime),
        });
    });

    it('payload real: manutenção cancelada ou remarcada não é lida', async () => {
        const { incidents } = await readProvider('salesforce');

        expect(byId(incidents, '20175043')).toBeUndefined();
        expect(byId(incidents, '20150992')).toBeUndefined();
    });

    it('payload real: manutenção confirmada com data passada fica como agendada, sem contar como em andamento', async () => {
        const { incidents } = await readProvider('salesforce');

        expect(byId(incidents, '20173261')).toMatchObject({
            status: 'scheduled',
            scheduledFor: new Date('2026-10-29T01:00:00.000Z'),
        });
    });

    it('pede as manutenções a partir de três dias atrás, pela data marcada, no limite da API', async () => {
        vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-31T12:00:00Z') });

        await readProvider('salesforce');

        const asked = vi.mocked(fetch).mock.calls.map(c => String(c[0])).find(u => u.startsWith(FEED_URLS.salesforceMaintenances));
        const query = new URL(asked ?? 'https://x.test').searchParams;
        expect(query.get('startTime')).toBe('2026-10-28T12:00:00.000Z');
        expect(query.get('sort')).toBe('plannedStartTime');
        expect(query.get('order')).toBe('ASC');
        expect(query.get('limit')).toBe('1000');
    });

    it('uma manutenção com status fora da lista observada é conteúdo fora do formato', async () => {
        const maintenances = salesforceMaintenances();
        maintenances[1].status = 'Paused';
        respondWith(FEED_URLS.salesforceMaintenances, JSON.stringify(maintenances));

        expect(await readProvider('salesforce')).toMatchObject({ status: 'unreachable', incidents: [] });
    });

    it('uma severidade fora da lista publicada pela API é conteúdo fora do formato', async () => {
        const incidents = salesforceIncidents();
        incidents[0].IncidentImpacts[0].severity = 'catastrophic';
        respondWith(FEED_URLS.salesforceIncidents, JSON.stringify(incidents));

        expect(await readProvider('salesforce')).toMatchObject({ status: 'unreachable', incidents: [] });
    });

    it('um id que não é numérico é conteúdo fora do formato', async () => {
        const incidents = salesforceIncidents();
        incidents[0].id = 'abc';
        respondWith(FEED_URLS.salesforceIncidents, JSON.stringify(incidents));

        expect(await readProvider('salesforce')).toMatchObject({ status: 'unreachable', incidents: [] });
    });

    it('o Feed só conta como lido com as duas listas: falha nas manutenções deixa o Feed não lido', async () => {
        routes.unshift([FEED_URLS.salesforceMaintenances, async () => new Response('erro', { status: 503 })]);

        expect(await readProvider('salesforce')).toMatchObject({ status: 'unreachable', incidents: [] });
    });

    it('os payloads reais são gravados e o card sai do catálogo sem a marca de "só acesso"', async () => {
        for (const result of await fetchAllStatuses()) await saveStatusResult(result);

        const snapshot = await getLatestStatus(new Date());
        const entry = snapshot.find(e => e.provider.id === 'salesforce');

        expect(entry?.result.readings).toEqual(['outage']);
        expect(entry?.result.accessOnly).toBe(false);
        expect(entry?.result.incidents.map(i => i.title)).toContain('Disruption #20004549');
    });
});

describe('Salesforce: limite da lista de manutenções', () => {
    it('registra no log quando a lista bate no limite do pedido', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const [maintenance] = salesforceMaintenances();
        respondWith(
            FEED_URLS.salesforceMaintenances,
            JSON.stringify(Array.from({ length: 1000 }, (_, id) => ({ ...maintenance, id }))),
        );

        await readProvider('salesforce');

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('1000'));
    });
});

describe('RSS da IBM: só `incident` e `maintenance` são Incidents', () => {
    it('payload real: avisos, notas de versão e boletins de segurança não são lidos', async () => {
        respondWith(FEED_URLS.ibm, feedFixture('ibm-rss', 'feed.rss'));

        const { incidents } = await readProvider('ibm-cloud');

        expect(incidents.map(i => i.externalId)).toEqual(['INC12259399']);
    });

    it('payload real: o guid é o id, o título vem sem a fase, e o fim vem do rodapé `Outage End`', async () => {
        respondWith(FEED_URLS.ibm, feedFixture('ibm-rss', 'feed.rss'));

        const result = await readProvider('ibm-cloud');

        expect(result.status).toBe('operational');
        expect(result.accessOnly).toBeFalsy();
        expect(result.incidents[0]).toMatchObject({
            sourceId: 'ibm-cloud-feed',
            kind: 'problem',
            status: 'resolved',
            title: 'Users will be unable to provision new resources',
            url: 'https://cloud.ibm.com/status?query=INC12259399&selected=history',
            createdAt: new Date('2026-10-21T12:49:38Z'),
            updatedAt: new Date('2026-10-30T22:41:52Z'),
            resolvedAt: new Date('2026-10-22T15:00:00Z'),
        });
    });

    it('um incidente sem marca de fim degrada o Provider e mantém o título entre as fases', async () => {
        respondWith(FEED_URLS.ibm, ibmRss(ibmItem({ title: 'INVESTIGATING: VPC errors' })));

        const investigating = await readProvider('ibm-cloud');
        respondWith(FEED_URLS.ibm, ibmRss(ibmItem({ title: 'MITIGATING: VPC errors' })));
        const mitigating = await readProvider('ibm-cloud');

        expect(investigating.status).toBe('degraded');
        expect(investigating.incidents[0]).toMatchObject({ status: 'investigating', title: 'VPC errors', externalId: 'INC1' });
        expect(mitigating.incidents[0].title).toBe('VPC errors');
    });

    it('o prefixo RESOLVED encerra mesmo sem `Outage End`, sem inventar a hora', async () => {
        respondWith(FEED_URLS.ibm, ibmRss(ibmItem({ title: 'RESOLVED: VPC errors' })));

        const { feeds, incidents } = await readProvider('ibm-cloud');

        expect(feeds).toMatchObject([{ read: true, declared: 'operational' }]);
        expect(incidents[0]).toMatchObject({ status: 'resolved' });
        expect(incidents[0].resolvedAt).toBeUndefined();
    });

    it('a palavra "resolved" no meio do título não encerra', async () => {
        respondWith(FEED_URLS.ibm, ibmRss(ibmItem({ title: 'INVESTIGATING: Tickets resolved by mistake: VPC' })));

        const { status, incidents } = await readProvider('ibm-cloud');

        expect(status).toBe('degraded');
        expect(incidents[0]).toMatchObject({ status: 'investigating', title: 'Tickets resolved by mistake: VPC' });
    });

    it('captura real: `Outage End` encerra o incidente que ficou com o título INVESTIGATING', async () => {
        respondWith(FEED_URLS.ibm, feedFixture('ibm-rss', 'incidents-and-maintenance-2020-09-26.xml'));

        const { feeds, incidents } = await readProvider('ibm-cloud');

        expect(feeds).toMatchObject([{ read: true, declared: 'operational' }]);
        expect(byId(incidents, 'INC2825083')).toMatchObject({
            status: 'resolved',
            title: 'Watson Assistant service is intermittently unavailable',
            resolvedAt: new Date('2020-09-04T11:07:00Z'),
        });
    });

    it('captura real: as fases de manutenção vêm do prefixo do título, e o início marcado do rodapé', async () => {
        respondWith(FEED_URLS.ibm, feedFixture('ibm-rss', 'incidents-and-maintenance-2020-09-26.xml'));

        const { incidents } = await readProvider('ibm-cloud');

        expect(byId(incidents, 'CHG0886589')).toMatchObject({
            kind: 'maintenance',
            status: 'scheduled',
            title: 'Update IBM Blockchain Platform for IBM Cloud',
            scheduledFor: new Date('2020-10-02T23:00:00Z'),
        });
        expect(byId(incidents, 'CHG0809534')).toMatchObject({
            kind: 'maintenance',
            status: 'completed',
            resolvedAt: new Date('2020-09-01T11:30:00Z'),
        });
        const inProgress = incidents.filter(i => i.status === 'in_progress');
        expect(inProgress).toHaveLength(1);
        expect(inProgress[0]).toMatchObject({
            kind: 'maintenance',
            title: 'Update Kubernetes Workers Nodes to Kube 1.17.11_1539',
            scheduledFor: new Date('2020-09-23T12:00:00Z'),
        });
    });

    it('captura real: manutenção cancelada não é lida, e nenhuma manutenção degrada o Provider', async () => {
        respondWith(FEED_URLS.ibm, feedFixture('ibm-rss', 'incidents-and-maintenance-2020-09-26.xml'));

        const { feeds, incidents } = await readProvider('ibm-cloud');

        expect(feeds).toMatchObject([{ read: true, declared: 'operational' }]);
        expect(incidents.map(i => i.title).join()).not.toContain('Maintenance for Internet Services');
        expect(incidents).toHaveLength(5);
    });

    it('um incidente sem guid usa o título sem a fase como id, porque o Feed não publicou um', async () => {
        respondWith(FEED_URLS.ibm, ibmRss(ibmItem({ title: 'INVESTIGATING: VPC errors', guid: null })));

        const { status, incidents } = await readProvider('ibm-cloud');

        expect(status).toBe('degraded');
        expect(incidents[0].externalId).toBe('VPC errors');
    });

    it('uma categoria que a família não conhece é conteúdo fora do formato: pode ser um Incident', async () => {
        respondWith(FEED_URLS.ibm, ibmRss(ibmItem({ title: 'INVESTIGATING: VPC errors', category: 'outage' })));

        expect(await readProvider('ibm-cloud')).toMatchObject({ status: 'unreachable', incidents: [] });
        expect(console.error).toHaveBeenCalled();
    });

    it('um item sem categoria é conteúdo fora do formato: não dá para saber se é um Incident', async () => {
        respondWith(FEED_URLS.ibm, ibmRss(ibmItem({ title: 'INVESTIGATING: VPC errors', category: null })));

        expect(await readProvider('ibm-cloud')).toMatchObject({ status: 'unreachable', incidents: [] });
    });

    it('uma data ilegível no rodapé é conteúdo fora do formato', async () => {
        respondWith(
            FEED_URLS.ibm,
            ibmRss(ibmItem({ title: 'RESOLVED: VPC errors', footer: 'Outage End: ontem à noite <br />' })),
        );

        expect(await readProvider('ibm-cloud')).toMatchObject({ status: 'unreachable', incidents: [] });
    });

    it('o Feed sem nenhum item é lido como Operational', async () => {
        respondWith(FEED_URLS.ibm, ibmRss());

        expect(await readProvider('ibm-cloud')).toMatchObject({ status: 'operational', incidents: [] });
    });

    it('os payloads reais são gravados sem interromper o Poll', async () => {
        respondWith(FEED_URLS.ibm, feedFixture('ibm-rss', 'incidents-and-maintenance-2020-09-26.xml'));

        for (const result of await fetchAllStatuses()) await saveStatusResult(result);

        const entry = (await getLatestStatus(new Date())).find(e => e.provider.id === 'ibm-cloud');
        expect(entry?.result.accessOnly).toBe(false);
    });
});
