// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AWSFetcher } from '@/lib/fetchers/aws';
import { AzureFetcher } from '@/lib/fetchers/azure';
import { GoogleCloudFetcher } from '@/lib/fetchers/google';
import { hoursBefore } from '../../helpers/time';

// Recent Incident é decidido pelo módulo de Provider Status; os leitores entregam tudo o que o Feed publica,
// de qualquer idade.
const now = new Date('2026-10-28T12:00:00Z');

const rss = (items: { title: string; pubDate: Date }[]) => `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Status</title>
${items.map(i => `<item><title>${i.title}</title><link>https://status.example.com/</link><pubDate>${i.pubDate.toUTCString()}</pubDate><description>details</description></item>`).join('\n')}
</channel></rss>`;

const respond = (body: string, json = false) =>
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            text: async () => body,
            json: async () => (json ? JSON.parse(body) : undefined),
        }),
    );

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('os leitores entregam todos os Incidents do Feed, de qualquer idade', () => {
    it.each([
        ['AWS', () => new AWSFetcher('aws', 'https://status.aws.amazon.com/rss/all.rss')],
        ['Azure', () => new AzureFetcher('azure', 'https://azure.status.microsoft/en-us/status/feed/')],
    ])('%s: Incident ativo publicado há 30 horas vem na leitura e mantém o Provider degradado', async (_name, make) => {
        respond(rss([{ title: 'Increased Error Rates', pubDate: hoursBefore(now, 30) }]));

        const result = await make().fetchStatus();

        expect(result.status).toBe('degraded');
        expect(result.incidents.map(i => i.title)).toEqual(['Increased Error Rates']);
    });

    it('Google Cloud: Incident ativo há 30 horas vem na leitura, e o resolvido traz a hora de resolução', async () => {
        const begin = hoursBefore(now, 30);
        const end = hoursBefore(now, 2);
        respond(
            JSON.stringify([
                { service_name: 'Cloud Run', external_desc: 'Elevated latency', begin: begin.toISOString(), uri: 'incidents/1' },
                {
                    service_name: 'BigQuery',
                    external_desc: 'Query failures',
                    begin: hoursBefore(now, 72).toISOString(),
                    end: end.toISOString(),
                    uri: 'incidents/2',
                },
            ]),
            true,
        );

        const result = await new GoogleCloudFetcher('google-cloud', 'https://status.cloud.google.com/incidents.json').fetchStatus();

        expect(result.status).toBe('degraded');
        expect(result.incidents).toEqual([
            expect.objectContaining({ title: 'Cloud Run: Elevated latency', status: 'investigating', createdAt: begin }),
            expect.objectContaining({ title: 'BigQuery: Query failures', status: 'resolved', resolvedAt: end }),
        ]);
        expect(result.incidents[0].resolvedAt).toBeUndefined();
    });
});
