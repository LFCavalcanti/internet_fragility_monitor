// @vitest-environment node
/**
 * Famílias RSS da AWS, RSS da Azure, Google Cloud e Heroku pela interface do módulo de Status Feed: o catálogo é o das
 * migrations reais, e a rede é a única coisa simulada. As fixtures são payloads reais gravados (coleta nos Comments
 * do Ticket 10).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMigratedDb, type MigratedDb } from '../../helpers/migrated-db';
import { FEED_URLS } from '../../helpers/feed-urls';
import { feedFixture, hang, outcomeOf, healthyResponse } from '../../helpers/status-feed';
import { hoursBefore } from '../../helpers/time';

import { readActiveCatalog, recordPoll } from '@/lib/poll-recording';
import { readAllProviders } from '@/lib/status-feed';
import { READ_TIMEOUT_MS } from '@/lib/status-feed/read-policy';
import { decideProviderStatus } from '@/lib/provider-status';

let current: MigratedDb;

const readAll = async () => readAllProviders(await readActiveCatalog(current.db));

type Network = (url: string, init?: RequestInit) => Promise<Response>;

const answers = new Map<string, Network>();
const respondWith = (feedUrl: string, body: string) => answers.set(feedUrl, async () => new Response(body));

async function readProvider(providerId: string) {
    const results = await readAll();
    const result = results.find(r => r.providerId === providerId);
    if (!result) throw new Error(`${providerId} fora do Poll`);
    return outcomeOf(result);
}

/** RSS mínimo no formato da AWS, com atualizações na ordem dada. */
const awsRss = (updates: { event: string; title: string; at: Date; description?: string }[]) => `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Amazon Web Services Service Status</title>
${updates
    .map(
        u => `<item><title><![CDATA[${u.title}]]></title><link>https://status.aws.amazon.com/</link>
<pubDate>${u.at.toUTCString()}</pubDate>
<guid isPermaLink="false">https://status.aws.amazon.com/#${u.event}_${Math.floor(u.at.getTime() / 1000)}</guid>
<description><![CDATA[${u.description ?? 'We are investigating.'}]]></description></item>`,
    )
    .join('\n')}
</channel></rss>`;

const azureRss = (items: string) =>
    `<?xml version="1.0"?><rss version="2.0"><channel><title>Azure Status</title>${items}</channel></rss>`;

beforeEach(async () => {
    current = await createMigratedDb();
    answers.clear();
    vi.stubGlobal(
        'fetch',
        vi.fn<Network>(async (url, init) => {
            const answer = answers.get(String(url));
            return answer ? answer(String(url), init) : healthyResponse(String(url));
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

describe('RSS da AWS: cada atualização é um item, e o Incident é o evento', () => {
    beforeEach(() => {
        respondWith(FEED_URLS.aws, feedFixture('aws-rss', 'all.rss'));
    });

    it('payload real: os 39 itens viram 3 eventos, com o id do evento e a data da última atualização', async () => {
        const { incidents } = await readProvider('aws');

        expect(incidents.map(i => i.externalId).sort()).toEqual([
            'apigateway-us-west-2',
            'multipleservices-me-central-1',
            'multipleservices-me-south-1',
        ]);
        expect(incidents.find(i => i.externalId === 'multipleservices-me-central-1')).toMatchObject({
            sourceId: 'aws-feed',
            kind: 'problem',
            status: 'investigating',
            title: 'Service disruption: Increased Error Rates',
            createdAt: new Date('2026-03-01T12:51:25Z'),
            updatedAt: new Date('2026-09-15T10:27:10Z'),
        });
    });

    it('payload real: os eventos do Oriente Médio seguem ativos meses depois, sem encerramento por silêncio', async () => {
        const { status, incidents } = await readProvider('aws');

        expect(status).toBe('degraded');
        expect(incidents.filter(i => i.status === 'investigating').map(i => i.externalId).sort()).toEqual([
            'multipleservices-me-central-1',
            'multipleservices-me-south-1',
        ]);
    });

    it('payload real: o evento que a AWS marcou como resolvido fecha na data da última atualização', async () => {
        const { incidents } = await readProvider('aws');

        expect(incidents.find(i => i.externalId === 'apigateway-us-west-2')).toMatchObject({
            status: 'resolved',
            resolvedAt: new Date('2026-10-30T01:28:38Z'),
        });
    });

    it('payload real gravado por dois Polls: três Incidents, não 39, e o resolvido com a hora publicada', async () => {
        for (let i = 0; i < 2; i++) {
            await recordPoll(current.db, await readAll());
        }

        const rows = await current.client.execute(
            "SELECT status, resolved_at FROM incidents WHERE provider_id = 'aws' ORDER BY status",
        );
        expect(rows.rows.map(r => r.status)).toEqual(['investigating', 'investigating', 'resolved']);
        expect(rows.rows[2].resolved_at).toBe(Date.parse('2026-10-30T01:28:38Z') / 1000);
    });

    const start = new Date('2026-10-01T10:00:00Z');

    it('um evento encerrado não mantém o Provider degradado', async () => {
        respondWith(
            FEED_URLS.aws,
            awsRss([
                { event: 'ec2-us-east-1', title: 'Service is operating normally: [RESOLVED] Elevated errors', at: start },
            ]),
        );

        const { status, incidents } = await readProvider('aws');

        expect(status).toBe('operational');
        expect(incidents[0]).toMatchObject({ status: 'resolved', resolvedAt: start });
    });

    it('a marca de resolvido vale só na última atualização, qualquer que seja a ordem dos itens', async () => {
        respondWith(
            FEED_URLS.aws,
            awsRss([
                { event: 'ec2-us-east-1', title: 'Service impact: Errors', at: hoursBefore(start, 1) },
                { event: 'ec2-us-east-1', title: 'Service impact: Errors', at: start, description: 'The issue is resolved and the service is operating normally.' },
                { event: 'ec2-us-east-1', title: 'Service impact: Errors', at: hoursBefore(start, 2) },
            ]),
        );

        const { incidents } = await readProvider('aws');

        expect(incidents).toHaveLength(1);
        expect(incidents[0]).toMatchObject({
            status: 'resolved',
            createdAt: hoursBefore(start, 2),
            updatedAt: start,
        });
    });

    it('uma atualização que só cita a recuperação parcial não encerra o evento', async () => {
        respondWith(
            FEED_URLS.aws,
            awsRss([
                {
                    event: 'ec2-us-east-1',
                    title: 'Service impact: Errors',
                    at: start,
                    description: 'The issue with S3 is resolved and that service is operating normally. EC2 is still impaired.',
                },
            ]),
        );

        expect((await readProvider('aws')).status).toBe('degraded');
    });

    it.each([
        'The issue has been resolved.',
        'All services are now operating normally.',
        'The issue is resolved and the service is operating normally. <a href="https://health.aws.amazon.com/">Details</a>',
    ])('a marca de fim vale no fecho da descrição: %s', async description => {
        respondWith(FEED_URLS.aws, awsRss([{ event: 'ec2-us-east-1', title: 'Service impact: Errors', at: start, description }]));

        expect((await readProvider('aws')).status).toBe('operational');
    });

    it('o fecho que fala dos outros serviços não encerra o evento', async () => {
        respondWith(
            FEED_URLS.aws,
            awsRss([
                {
                    event: 'ec2-us-east-1',
                    title: 'Service impact: Errors',
                    at: start,
                    description: 'EC2 is still impaired. All other services are operating normally.',
                },
            ]),
        );

        expect((await readProvider('aws')).status).toBe('degraded');
    });

    it('um evento novo no mesmo serviço e região começa depois do último resolvido', async () => {
        const reopened = hoursBefore(start, 1);
        respondWith(
            FEED_URLS.aws,
            awsRss([
                { event: 'ec2-us-east-1', title: 'Service impact: New errors', at: start },
                { event: 'ec2-us-east-1', title: 'Service impact: New errors', at: reopened },
                { event: 'ec2-us-east-1', title: '[RESOLVED] Old errors', at: hoursBefore(start, 24) },
                { event: 'ec2-us-east-1', title: 'Service impact: Old errors', at: hoursBefore(start, 30) },
            ]),
        );

        const { status, incidents } = await readProvider('aws');

        expect(status).toBe('degraded');
        expect(incidents).toHaveLength(1);
        expect(incidents[0]).toMatchObject({ title: 'Service impact: New errors', status: 'investigating', createdAt: reopened });
    });

    it('um item só no Feed também é lido', async () => {
        respondWith(FEED_URLS.aws, awsRss([{ event: 's3-eu-west-1', title: 'Service impact: Errors', at: start }]));

        expect((await readProvider('aws')).incidents.map(i => i.externalId)).toEqual(['s3-eu-west-1']);
    });

    it('um guid sem o evento e o instante é conteúdo fora do formato', async () => {
        respondWith(
            FEED_URLS.aws,
            awsRss([{ event: 'x', title: 'Service impact: Errors', at: start }]).replace(/#x_\d+/, 'sem-evento'),
        );

        expect((await readProvider('aws')).status).toBe('unreachable');
    });

    it('Incident ativo há 30 horas vem na leitura e mantém o Provider degradado', async () => {
        const now = new Date();
        respondWith(FEED_URLS.aws, awsRss([{ event: 'rds-us-east-1', title: 'Increased Error Rates', at: hoursBefore(now, 30) }]));

        const { status, incidents } = await readProvider('aws');

        expect(status).toBe('degraded');
        expect(incidents.map(i => i.title)).toEqual(['Increased Error Rates']);
    });
});

describe('RSS da Azure: um item por evento, com slug no guid', () => {
    it('payload real sem Incidents: Operational', async () => {
        respondWith(FEED_URLS.azure, feedFixture('azure-rss', 'no-incidents.xml'));

        expect(await readProvider('azure')).toMatchObject({ status: 'operational', incidents: [] });
    });

    it('payload real com Incident ativo: degrada, com o guid como id e a fonte de origem', async () => {
        respondWith(FEED_URLS.azure, feedFixture('azure-rss', 'active-incident-2024-12-27.xml'));

        const { status, incidents } = await readProvider('azure');

        expect(status).toBe('degraded');
        expect(incidents).toHaveLength(1);
        expect(incidents[0]).toMatchObject({
            sourceId: 'azure-feed',
            externalId: 'active-storage-latency-timeouts-or-http-500-errors-in-south-central-us',
            kind: 'problem',
            status: 'investigating',
            title: 'Active - Storage latency, timeouts, or HTTP 500 errors in South Central US',
            url: 'https://status.azure.com/en-us/status/',
            createdAt: new Date('2024-12-26T18:44:00Z'),
        });
    });

    it('um item declarado resolvido não degrada o Provider', async () => {
        respondWith(
            FEED_URLS.azure,
            azureRss(
                '<item><guid>a</guid><title>Resolved - Storage latency</title><pubDate>Thu, 26 Dec 2024 18:44:00 Z</pubDate></item>',
            ),
        );

        expect(await readProvider('azure')).toMatchObject({
            status: 'operational',
            incidents: [expect.objectContaining({ status: 'resolved' })],
        });
    });

    it('sem guid publicado, o título é o id', async () => {
        respondWith(
            FEED_URLS.azure,
            azureRss('<item><title>Active - Latency</title><pubDate>Thu, 26 Dec 2024 18:44:00 Z</pubDate></item>'),
        );

        expect((await readProvider('azure')).incidents[0].externalId).toBe('Active - Latency');
    });

    it('Incident ativo há 30 horas vem na leitura e mantém o Provider degradado', async () => {
        const at = hoursBefore(new Date(), 30).toUTCString();
        respondWith(FEED_URLS.azure, azureRss(`<item><guid>a</guid><title>Increased Error Rates</title><pubDate>${at}</pubDate></item>`));

        const { status, incidents } = await readProvider('azure');

        expect(status).toBe('degraded');
        expect(incidents.map(i => i.title)).toEqual(['Increased Error Rates']);
    });
});

describe('Google Cloud', () => {
    it('payload real: Incidents encerrados, com o id do Feed, a hora de resolução e o link da status page', async () => {
        respondWith(FEED_URLS.googleCloud, feedFixture('google-cloud', 'incidents.json'));

        const { status, incidents } = await readProvider('google-cloud');

        expect(status).toBe('operational');
        expect(incidents).toHaveLength(8);
        expect(incidents[0]).toMatchObject({
            sourceId: 'google-cloud-feed',
            externalId: 'Xs2XTHzAVC9YnafnPyzj',
            kind: 'problem',
            status: 'resolved',
            title: 'Multiple Products: Multiple services were experiencing issues in the europe-west2 region.',
            url: 'https://status.cloud.google.com/incidents/Xs2XTHzAVC9YnafnPyzj',
            createdAt: new Date('2026-10-20T06:00:00Z'),
            updatedAt: new Date('2026-10-28T00:38:39Z'),
            resolvedAt: new Date('2026-10-20T12:08:00Z'),
        });
    });

    it('Incident ativo há 30 horas vem na leitura e degrada; o resolvido traz a hora de resolução', async () => {
        const now = new Date();
        const begin = hoursBefore(now, 30);
        const end = hoursBefore(now, 2);
        respondWith(
            FEED_URLS.googleCloud,
            JSON.stringify([
                { id: 'a1', service_name: 'Cloud Run', external_desc: 'Elevated latency', begin: begin.toISOString(), end: null, uri: 'incidents/a1' },
                { id: 'b2', service_name: 'BigQuery', external_desc: 'Query failures', begin: hoursBefore(now, 72).toISOString(), end: end.toISOString(), uri: 'incidents/b2' },
            ]),
        );

        const { status, incidents } = await readProvider('google-cloud');

        expect(status).toBe('degraded');
        expect(incidents).toEqual([
            expect.objectContaining({ externalId: 'a1', title: 'Cloud Run: Elevated latency', status: 'investigating', createdAt: begin }),
            expect.objectContaining({ externalId: 'b2', title: 'BigQuery: Query failures', status: 'resolved', resolvedAt: end }),
        ]);
        expect(incidents[0].resolvedAt).toBeUndefined();
    });

    it('um Incident sem id é conteúdo fora do formato', async () => {
        respondWith(
            FEED_URLS.googleCloud,
            JSON.stringify([{ service_name: 'Cloud Run', external_desc: 'x', begin: '2026-10-20T06:00:00+00:00' }]),
        );

        expect((await readProvider('google-cloud')).status).toBe('unreachable');
    });

    it('os payloads reais, com relatórios longos, são gravados sem interromper o Poll', async () => {
        respondWith(FEED_URLS.googleCloud, feedFixture('google-cloud', 'incidents.json'));

        await recordPoll(current.db, await readAll());

        const rows = await current.client.execute(
            "SELECT count(*) AS total, max(length(description)) AS longest FROM incidents WHERE provider_id = 'google-cloud'",
        );
        expect(rows.rows[0].total).toBe(8);
        expect(rows.rows[0].longest).toBe(5000);
    });
});

describe('Heroku', () => {
    it('payload real sem Incidents: Operational, com o id numérico da manutenção como texto', async () => {
        respondWith(FEED_URLS.heroku, feedFixture('heroku', 'current-status.json'));

        const { status, incidents } = await readProvider('heroku');

        expect(status).toBe('operational');
        expect(incidents.map(i => i.externalId)).toEqual(['2965', '2959', '2956']);
        expect(incidents.every(i => i.kind === 'maintenance' && i.sourceId === 'heroku-feed')).toBe(true);
    });

    it('payload real: a lista `scheduled` traz a fase pela última atualização publicada', async () => {
        respondWith(FEED_URLS.heroku, feedFixture('heroku', 'current-status.json'));

        const { incidents } = await readProvider('heroku');

        expect(incidents.find(i => i.externalId === '2965')).toMatchObject({
            kind: 'maintenance',
            status: 'completed',
            title: 'Heroku Platform Maintenance',
            url: 'https://status.heroku.com/incidents/2965',
        });
        expect(incidents.find(i => i.externalId === '2959')).toMatchObject({
            kind: 'maintenance',
            status: 'scheduled',
            scheduledFor: new Date('2026-07-15T17:00:24.339Z'),
        });
    });

    it('payload real: manutenção antiga que o Feed ainda chama de upcoming não vira Maintenance nem Upcoming Maintenance', async () => {
        respondWith(FEED_URLS.heroku, feedFixture('heroku', 'current-status.json'));
        const reading = await readProvider('heroku');

        const decision = decideProviderStatus({
            ...reading,
            previousPollUnanswered: false,
            now: new Date('2026-10-31T00:58:30Z'),
        });

        expect(decision).toMatchObject({ status: 'operational', incidents: [], upcomingMaintenance: null });
    });

    it('payload real com Incidents abertos: traz o id, a fase e a atualização mais recente', async () => {
        respondWith(FEED_URLS.heroku, feedFixture('heroku', 'open-incidents-2022-04-27.json'));

        const { incidents } = await readProvider('heroku');

        expect(incidents.map(i => i.externalId)).toEqual(['2423', '2413']);
        expect(incidents[0]).toMatchObject({
            sourceId: 'heroku-feed',
            kind: 'problem',
            status: 'investigating',
            title: 'Issues using data products',
            url: 'https://status.heroku.com/incidents/2423',
            createdAt: new Date('2022-04-26T14:08:45.973Z'),
        });
    });

    it('payload real: amarelo em Data e Tools degrada, mesmo com Apps verde', async () => {
        respondWith(FEED_URLS.heroku, feedFixture('heroku', 'open-incidents-2022-04-27.json'));

        expect((await readProvider('heroku')).status).toBe('degraded');
    });

    it('vermelho em qualquer sistema é Outage', async () => {
        respondWith(
            FEED_URLS.heroku,
            JSON.stringify({
                status: [{ system: 'Apps', status: 'yellow' }, { system: 'Data', status: 'red' }],
                incidents: [],
                scheduled: [],
            }),
        );

        expect((await readProvider('heroku')).status).toBe('outage');
    });

    it('uma cor desconhecida é conteúdo fora do formato, nunca Operational', async () => {
        respondWith(
            FEED_URLS.heroku,
            JSON.stringify({ status: [{ system: 'Apps', status: 'purple' }], incidents: [], scheduled: [] }),
        );

        expect((await readProvider('heroku')).status).toBe('unreachable');
    });

    it('sem nenhum sistema no Feed, o conteúdo está fora do formato', async () => {
        respondWith(FEED_URLS.heroku, JSON.stringify({ status: [], incidents: [], scheduled: [] }));

        expect((await readProvider('heroku')).status).toBe('unreachable');
    });
});

describe.each([
    ['AWS', 'aws', 'aws-feed', FEED_URLS.aws],
    ['Azure', 'azure', 'azure-feed', FEED_URLS.azure],
    ['Google Cloud', 'google-cloud', 'google-cloud-feed', FEED_URLS.googleCloud],
    ['Heroku', 'heroku', 'heroku-feed', FEED_URLS.heroku],
    ['RSS da IBM', 'ibm-cloud', 'ibm-cloud-feed', FEED_URLS.ibm],
    ['Salesforce', 'salesforce', 'salesforce-feed', FEED_URLS.salesforceIncidents],
])('%s pela política de leitura', (_name, providerId, sourceId, feedUrl) => {
    it('uma leitura registra a fonte e a duração no log', async () => {
        await readProvider(providerId);

        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`${sourceId} lida em \\d+ ms`)));
    });

    it('em timeout, fica Unreachable ao fim dos 10 segundos, sem atrasar os outros, com a duração no log', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        answers.set(feedUrl, hang);
        let result: ReturnType<typeof outcomeOf>[] | undefined;

        const reading = readAll().then(r => (result = r.map(outcomeOf)));
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
        expect(result).toBeUndefined();
        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/github-feed lida em \d+ ms/));

        await vi.advanceTimersByTimeAsync(1);
        await reading;

        expect(result?.find(r => r.providerId === providerId)).toMatchObject({ status: 'unreachable', incidents: [] });
        expect(console.error).toHaveBeenCalledWith(
            expect.stringMatching(new RegExp(`${sourceId} falhou em \\d+ ms`)),
            expect.objectContaining({ message: expect.stringContaining('timeout') }),
        );
    });

    it('resposta 5xx: Unreachable, nunca Outage', async () => {
        answers.set(feedUrl, async () => new Response('erro', { status: 503 }));

        expect(await readProvider(providerId)).toMatchObject({ status: 'unreachable', incidents: [] });
    });

    it('erro de rede: Unreachable, sem Incidents', async () => {
        answers.set(feedUrl, async () => {
            throw new TypeError('ECONNRESET');
        });

        expect(await readProvider(providerId)).toMatchObject({ status: 'unreachable', incidents: [] });
    });

    it('conteúdo fora do formato: Unreachable, com registro no log', async () => {
        answers.set(feedUrl, async () => new Response('<html><body>Em manutenção</body></html>'));

        expect(await readProvider(providerId)).toMatchObject({ status: 'unreachable', incidents: [] });
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining(sourceId), expect.anything());
    });

    it('a URL buscada é a do catálogo, sem cache e com o sinal da política', async () => {
        await readProvider(providerId);

        const call = vi.mocked(fetch).mock.calls.find(c => c[0] === feedUrl);
        expect(call?.[1]).toMatchObject({ cache: 'no-store', signal: expect.any(AbortSignal) });
    });
});

describe('o registro de leitores cobre as famílias que o Poll lê', () => {
    it('nenhum Feed ativo do catálogo fica sem leitor', async () => {
        await readAll();

        expect(console.error).not.toHaveBeenCalled();
    });
});
