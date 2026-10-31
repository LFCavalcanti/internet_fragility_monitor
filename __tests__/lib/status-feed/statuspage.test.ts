// @vitest-environment node
/**
 * Família Statuspage.io lida pela política de leitura, com a rede simulada.
 * As fixtures são payloads reais gravados (coleta nos Comments do Ticket 09); só `components` foi retirado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFeed } from '@/lib/status-feed/read-policy';
import { statuspageReader } from '@/lib/status-feed/readers/statuspage';
import { decideProviderStatus, type FeedReading } from '@/lib/provider-status';
import { feedFixture } from '../../helpers/status-feed';

const fixture = (name: string): string => feedFixture('statuspage', name);

const CLOUDFLARE = { id: 'cloudflare-feed', url: 'https://www.cloudflarestatus.com' };
const HOSTINGER = { id: 'hostinger-feed', url: 'https://statuspage.hostinger.com' };
const POLL_AT = new Date('2026-10-31T00:48:00Z');

function respondWith(body: string, init?: ResponseInit) {
    const fetchMock = vi.fn(async () => new Response(body, init));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

async function read(body: string, source = CLOUDFLARE) {
    respondWith(body);
    const reading = await readFeed(source, statuspageReader, POLL_AT);
    if (!reading.read) throw new Error('Feed não lido');
    return reading;
}

function decide(reading: FeedReading, now: string) {
    return decideProviderStatus({
        accessOnly: false,
        feeds: [reading],
        probes: [],
        previousPollUnanswered: false,
        now: new Date(now),
    });
}

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('payload real da Cloudflare: indicador major e manutenções agendadas', () => {
    it('declara Outage e traz as 25 manutenções agendadas como manutenção, sem problema inventado', async () => {
        const reading = await read(fixture('cloudflare-major.json'));

        expect(reading.declared).toBe('outage');
        expect(reading.incidents).toHaveLength(25);
        expect(reading.incidents.every(i => i.kind === 'maintenance' && i.status === 'scheduled')).toBe(true);
    });

    it('cada manutenção traz a Provider Source de origem, o id do Feed, o título e a data marcada', async () => {
        const reading = await read(fixture('cloudflare-major.json'));

        expect(reading.incidents[0]).toMatchObject({
            sourceId: 'cloudflare-feed',
            externalId: 'jj0q4l1v75m8',
            kind: 'maintenance',
            status: 'scheduled',
            scheduledFor: new Date('2026-11-01T01:00:00.000Z'),
        });
        const ids = reading.incidents.map(i => i.externalId);
        expect(new Set(ids).size).toBe(25);
    });

    it('chega ao módulo de Provider Status como Outage com Upcoming Maintenance', async () => {
        const decision = decide(await read(fixture('cloudflare-major.json')), '2026-10-31T00:48:00Z');

        expect(decision.status).toBe('outage');
        expect(decision.upcomingMaintenance?.count).toBe(25);
    });
});

describe('payload real da Zoom: manutenção em andamento', () => {
    it('com indicador none e manutenção in_progress, o Feed declara Maintenance e o Provider fica em Maintenance', async () => {
        const reading = await read(fixture('zoom-maintenance-in-progress.json'));

        expect(reading.declared).toBe('maintenance');
        expect(reading.incidents.find(i => i.externalId === 'v5w5rpvqj35f')).toMatchObject({
            kind: 'maintenance',
            status: 'in_progress',
            scheduledFor: new Date('2026-10-16T16:00:00.000Z'),
        });
        expect(decide(reading, '2026-10-31T00:48:00Z').status).toBe('maintenance');
    });
});

describe('payload real da Hostinger: Incident publicado', () => {
    it('a lista incidents vira problema com a fase, o id do Feed e a Provider Source', async () => {
        const reading = await read(fixture('hostinger-incident.json'), HOSTINGER);

        expect(reading.incidents[0]).toMatchObject({
            sourceId: 'hostinger-feed',
            externalId: 'pj2zs1lx3n9d',
            kind: 'problem',
            status: 'monitoring',
            title: 'PHP Security Update for Web, Agency and cPanel Hosting',
            createdAt: new Date('2026-10-21T17:44:19.034Z'),
        });
    });
});

describe('classificação pela estrutura do Feed', () => {
    const summary = {
        status: { indicator: 'minor', description: 'Minor Service Outage' },
        incidents: [
            {
                id: 'inc1',
                name: 'Scheduled maintenance of the dashboard caused errors',
                status: 'identified',
                shortlink: 'https://stspg.io/inc1',
                created_at: '2026-10-26T12:00:00Z',
                updated_at: '2026-10-26T13:00:00Z',
                incident_updates: [{ body: 'We are investigating a maintenance-related issue.' }],
            },
            { id: 'inc2', name: 'Old postmortem', status: 'postmortem', created_at: '2026-10-20T12:00:00Z' },
        ],
        scheduled_maintenances: [
            { id: 'mnt1', name: 'Network upgrade', status: 'in_progress', created_at: '2026-10-19T10:00:00Z', incident_updates: [] },
            { id: 'mnt2', name: 'Database failover', status: 'verifying', created_at: '2026-10-19T10:00:00Z', scheduled_for: null },
            { id: 'mnt3', name: 'Storage migration', status: 'completed', created_at: '2026-10-18T10:00:00Z' },
        ],
    };

    it('um item da lista incidents é problema, mesmo com "maintenance" no título, e usa a última atualização como descrição', async () => {
        const reading = await read(JSON.stringify(summary));

        expect(reading.declared).toBe('degraded');
        expect(reading.incidents[0]).toMatchObject({
            kind: 'problem',
            status: 'identified',
            title: 'Scheduled maintenance of the dashboard caused errors',
            description: 'We are investigating a maintenance-related issue.',
            url: 'https://stspg.io/inc1',
            updatedAt: new Date('2026-10-26T13:00:00Z'),
        });
    });

    it('postmortem conta como resolvido', async () => {
        const reading = await read(JSON.stringify(summary));

        expect(reading.incidents[1]).toMatchObject({ kind: 'problem', status: 'resolved' });
    });

    it('as fases de manutenção vêm do Feed: verifying ainda é em andamento', async () => {
        const reading = await read(JSON.stringify(summary));

        expect(reading.incidents.filter(i => i.kind === 'maintenance').map(m => [m.externalId, m.status])).toEqual([
            ['mnt1', 'in_progress'],
            ['mnt2', 'in_progress'],
            ['mnt3', 'completed'],
        ]);
    });

    it.each([
        ['none', 'operational'],
        ['minor', 'degraded'],
        ['major', 'outage'],
        ['critical', 'outage'],
    ])('indicador %s declara %s', async (indicator, declared) => {
        const reading = await read(JSON.stringify({ ...summary, scheduled_maintenances: [], status: { indicator } }));

        expect(reading.declared).toBe(declared);
    });

    it.each([
        ['none', 'maintenance'],
        ['maintenance', 'maintenance'],
        ['minor', 'degraded'],
        ['major', 'outage'],
        ['critical', 'outage'],
    ])('com manutenção em andamento, o indicador %s declara %s: Maintenance nunca prevalece sobre um problema', async (indicator, declared) => {
        const reading = await read(JSON.stringify({ ...summary, status: { indicator } }));

        expect(reading.declared).toBe(declared);
    });

    it('a fase verifying também declara Maintenance, porque ainda é em andamento', async () => {
        const reading = await read(
            JSON.stringify({
                status: { indicator: 'none' },
                incidents: [],
                scheduled_maintenances: [summary.scheduled_maintenances[1]],
            }),
        );

        expect(reading.declared).toBe('maintenance');
    });

    it('manutenção agendada ou encerrada não declara Maintenance', async () => {
        const reading = await read(
            JSON.stringify({
                status: { indicator: 'none' },
                incidents: [],
                scheduled_maintenances: [
                    summary.scheduled_maintenances[2],
                    { id: 'mnt4', name: 'Window', status: 'scheduled', created_at: '2026-10-20T10:00:00Z', scheduled_for: '2026-10-27T05:00:00Z' },
                ],
            }),
        );

        expect(reading.declared).toBe('operational');
    });

    it('indicador maintenance sem manutenção em andamento resulta em Operational', async () => {
        const reading = await read(
            JSON.stringify({
                status: { indicator: 'maintenance', description: 'Service Under Maintenance' },
                incidents: [],
                scheduled_maintenances: [
                    { id: 'mnt1', name: 'LIM (Lima) datacenter', status: 'scheduled', created_at: '2026-10-20T10:00:00Z', scheduled_for: '2026-10-27T05:00:00Z' },
                ],
            }),
        );

        expect(reading.declared).toBe('operational');
        expect(decide(reading, '2026-10-26T15:00:00Z').status).toBe('operational');
    });
});

describe('endereço do Feed', () => {
    it.each([
        ['https://www.cloudflarestatus.com', 'https://www.cloudflarestatus.com/api/v2/summary.json'],
        ['https://www.githubstatus.com', 'https://www.githubstatus.com/api/v2/summary.json'],
        ['https://www.vercel-status.com', 'https://www.vercel-status.com/api/v2/summary.json'],
    ])('a URL do catálogo %s é lida em summary.json', async (url, expected) => {
        const fetchMock = respondWith(JSON.stringify({ status: { indicator: 'none' }, incidents: [], scheduled_maintenances: [] }));

        await readFeed({ id: 'feed', url }, statuspageReader, POLL_AT);

        expect(String((fetchMock.mock.calls as unknown[][])[0][0])).toBe(expected);
    });
});

describe('conteúdo fora do formato vira Feed não lido, com registro no log', () => {
    const valid = { status: { indicator: 'none' }, incidents: [], scheduled_maintenances: [] };
    const item = { id: 'a', name: 'x', status: 'investigating', created_at: '2026-10-26T12:00:00Z' };

    it.each<[string, string]>([
        ['HTML no lugar de JSON', '<!DOCTYPE html><html></html>'],
        ['sem o bloco status', JSON.stringify({ incidents: [], scheduled_maintenances: [] })],
        ['indicador desconhecido', JSON.stringify({ ...valid, status: { indicator: 'catastrophic' } })],
        ['sem a lista incidents', JSON.stringify({ status: { indicator: 'none' }, scheduled_maintenances: [] })],
        ['sem a lista de manutenções', JSON.stringify({ status: { indicator: 'none' }, incidents: [] })],
        ['Incident sem id', JSON.stringify({ ...valid, incidents: [{ ...item, id: undefined }] })],
        ['Incident com título vazio', JSON.stringify({ ...valid, incidents: [{ ...item, name: '' }] })],
        ['Incident com fase desconhecida', JSON.stringify({ ...valid, incidents: [{ ...item, status: 'exploded' }] })],
        ['Incident com data inválida', JSON.stringify({ ...valid, incidents: [{ ...item, created_at: 'ontem' }] })],
        ['manutenção com fase desconhecida', JSON.stringify({ ...valid, scheduled_maintenances: [{ ...item, status: 'investigating' }] })],
    ])('%s', async (_case, body) => {
        respondWith(body);

        const reading = await readFeed(CLOUDFLARE, statuspageReader, POLL_AT);

        expect(reading).toEqual({ read: false, answered: true, gotHttpResponse: true });
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('cloudflare-feed'), expect.anything());
    });
});
