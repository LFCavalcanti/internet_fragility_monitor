// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { StatusPageFetcher } from '@/lib/fetchers/statuspage';
import { CloudflareFetcher } from '@/lib/fetchers/cloudflare';
import { GitHubFetcher } from '@/lib/fetchers/github';
import { VercelFetcher } from '@/lib/fetchers/vercel';

// Payload no formato do summary.json da Statuspage.io (recortado do caso da Cloudflare de 26/10/2026).
const summary = {
    status: { indicator: 'major', description: 'Partial System Outage' },
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
    ],
    scheduled_maintenances: [
        {
            id: 'mnt1',
            name: 'LIM (Lima) datacenter',
            status: 'scheduled',
            shortlink: 'https://stspg.io/mnt1',
            created_at: '2026-10-20T10:00:00Z',
            updated_at: '2026-10-20T10:00:00Z',
            scheduled_for: '2026-10-27T05:00:00Z',
            scheduled_until: '2026-10-27T09:00:00Z',
            incident_updates: [{ body: 'Scheduled maintenance.' }],
        },
        {
            id: 'mnt2',
            name: 'Network upgrade',
            status: 'in_progress',
            shortlink: 'https://stspg.io/mnt2',
            created_at: '2026-10-19T10:00:00Z',
            scheduled_for: '2026-10-26T14:00:00Z',
            incident_updates: [],
        },
        {
            id: 'mnt3',
            name: 'Database failover',
            status: 'verifying',
            created_at: '2026-10-19T10:00:00Z',
            scheduled_for: '2026-10-26T13:00:00Z',
        },
        {
            id: 'mnt4',
            name: 'Storage migration',
            status: 'completed',
            created_at: '2026-10-18T10:00:00Z',
            scheduled_for: '2026-10-25T13:00:00Z',
        },
    ],
};

function stubFetch(body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        statusText: 'OK',
        json: async () => body,
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('StatusPageFetcher', () => {
    it('classifica a lista de incidents como problema, mesmo com "maintenance" no texto', async () => {
        stubFetch(summary);
        const result = await new StatusPageFetcher('cloudflare', 'https://www.cloudflarestatus.com').fetchStatus();

        expect(result.status).toBe('outage');
        expect(result.incidents[0]).toMatchObject({
            kind: 'problem',
            status: 'identified',
            title: 'Scheduled maintenance of the dashboard caused errors',
        });
    });

    it('classifica a lista scheduled_maintenances como manutenção, com a fase declarada e a data marcada', async () => {
        stubFetch(summary);
        const result = await new StatusPageFetcher('cloudflare', 'https://www.cloudflarestatus.com').fetchStatus();

        const maintenances = result.incidents.filter(i => i.kind === 'maintenance');
        expect(maintenances.map(m => [m.title, m.status])).toEqual([
            ['LIM (Lima) datacenter', 'scheduled'],
            ['Network upgrade', 'in_progress'],
            ['Database failover', 'in_progress'],
            ['Storage migration', 'completed'],
        ]);
        expect(maintenances[0]).toMatchObject({
            kind: 'maintenance',
            scheduledFor: new Date('2026-10-27T05:00:00Z'),
            url: 'https://stspg.io/mnt1',
        });
    });

    it('as cópias de Cloudflare, GitHub e Vercel leem as manutenções do Feed', async () => {
        const fetchMock = stubFetch(summary);
        for (const fetcher of [new CloudflareFetcher(), new GitHubFetcher(), new VercelFetcher()]) {
            const result = await fetcher.fetchStatus();
            expect(result.incidents.filter(i => i.kind === 'maintenance')).toHaveLength(4);
        }
        expect(fetchMock.mock.calls.map(c => c[0])).toEqual([
            'https://www.cloudflarestatus.com/api/v2/summary.json',
            'https://www.githubstatus.com/api/v2/summary.json',
            'https://www.vercel-status.com/api/v2/summary.json',
        ]);
    });
});
