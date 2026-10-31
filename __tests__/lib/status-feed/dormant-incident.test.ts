// @vitest-environment node
/**
 * Dormant Incident pela interface de leitura de cada família: payload e relógio fixo entram, e só o estado declarado e
 * os Incidents devolvidos são conferidos. A rede é a única coisa simulada.
 * O caso real dos eventos da AWS no Oriente Médio está em feed-families.test.ts, com a fixture gravada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { decideProviderStatus, type FeedReading } from '@/lib/provider-status';
import { readFeed, type FeedReader } from '@/lib/status-feed/read-policy';
import { awsRssReader } from '@/lib/status-feed/readers/aws-rss';
import { azureRssReader } from '@/lib/status-feed/readers/azure-rss';
import { googleCloudReader } from '@/lib/status-feed/readers/google-cloud';
import { herokuReader } from '@/lib/status-feed/readers/heroku';
import { ibmRssReader } from '@/lib/status-feed/readers/ibm-rss';
import { salesforceReader } from '@/lib/status-feed/readers/salesforce';
import { statuspageReader } from '@/lib/status-feed/readers/statuspage';
import { FEED_URLS } from '../../helpers/feed-urls';
import { feedFixture } from '../../helpers/status-feed';

const POLL_AT = new Date('2026-10-31T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number) => new Date(POLL_AT.getTime() - days * DAY_MS);
const secondsLater = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000);

const rss = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Status</title>${items}</channel></rss>`;

const AWS_IMPACT = 'Service impact: Errors';
const AWS_DISRUPTION = 'Service disruption: Errors';

const awsItem = (title: string, at: Date) => `<item><title><![CDATA[${title}]]></title>
<pubDate>${at.toUTCString()}</pubDate>
<guid isPermaLink="false">https://status.aws.amazon.com/#ec2-us-east-1_${Math.floor(at.getTime() / 1000)}</guid>
<description><![CDATA[We are investigating.]]></description></item>`;

/** Evento da AWS com as atualizações dadas, da primeira para a última, todas com o título dado. */
const awsEventTitled = (title: string, ...updates: Date[]) => rss(updates.map(at => awsItem(title, at)).join(''));
const awsEvent = (...updates: Date[]) => awsEventTitled(AWS_IMPACT, ...updates);

const azureProblem = (at: Date) =>
    rss(`<item><guid>a</guid><title>Active - Storage latency</title><pubDate>${at.toUTCString()}</pubDate></item>`);

const googleProblem = (begin: Date, modified: Date | null, status_impact = 'SERVICE_DISRUPTION') =>
    JSON.stringify([
        {
            id: 'a1',
            status_impact,
            service_name: 'Cloud Run',
            external_desc: 'Elevated latency',
            begin: begin.toISOString(),
            end: null,
            modified: modified?.toISOString() ?? null,
        },
    ]);

const ibmItem = ({ title, guid, category, created, updated }: { title: string; guid: string; category: string; created: Date; updated: Date | null }) =>
    `<item><title><![CDATA[${title}]]></title>
<description><![CDATA[<p>Texto.</p> Type: ${category} <br /> ${updated ? `Update Time: ${updated.toUTCString()} <br />` : ''}]]></description>
<guid isPermaLink="false">${guid}</guid><category><![CDATA[${category}]]></category>
<pubDate>${created.toUTCString()}</pubDate></item>`;

const ibmProblem = (created: Date, updated: Date | null) =>
    ibmItem({ title: 'INVESTIGATING: VPC errors', guid: 'INC1', category: 'incident', created, updated });

const ibmMaintenance = (created: Date, updated: Date | null) =>
    ibmItem({ title: 'MAINTENANCE: Workers', guid: 'CHG1', category: 'maintenance', created, updated });

const salesforceIncident = ({
    id = 1,
    created,
    updated,
    severity = 'minor',
}: {
    id?: number;
    created: Date;
    updated: Date | null;
    severity?: 'minor' | 'major';
}) => ({
    id,
    type: 'Disruption',
    createdAt: created.toISOString(),
    updatedAt: updated?.toISOString() ?? null,
    IncidentImpacts: [{ severity, endTime: null }],
    IncidentEvents: [],
});

const salesforceMaintenance = (created: Date, updated: Date | null) => ({
    id: 2,
    name: 'Spiff Application Updates',
    status: 'Active',
    createdAt: created.toISOString(),
    updatedAt: updated?.toISOString() ?? null,
    MaintenanceImpacts: [],
});

const AWS = { id: 'aws-feed', url: FEED_URLS.aws };
const AZURE = { id: 'azure-feed', url: FEED_URLS.azure };
const GOOGLE = { id: 'google-cloud-feed', url: FEED_URLS.googleCloud };
const IBM = { id: 'ibm-cloud-feed', url: FEED_URLS.ibm };
const SALESFORCE = { id: 'salesforce-feed', url: 'https://api.status.salesforce.com/v1' };

/** A rede devolve cada corpo na ordem dos endereços do leitor, e a leitura precisa dar certo. */
async function read(reader: FeedReader, source: { id: string; url: string }, bodies: unknown[], pollAt = POLL_AT) {
    const responses = bodies.map(body => (typeof body === 'string' ? body : JSON.stringify(body)));
    let next = 0;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(responses[next++])));

    const reading = await readFeed(source, reader, pollAt);
    if (!reading.read) throw new Error('Feed não lido');
    return reading;
}

const readSalesforce = (incidents: unknown[], maintenances: unknown[] = []) =>
    read(salesforceReader, SALESFORCE, [incidents, maintenances]);

const recentIncidents = (reading: FeedReading) =>
    decideProviderStatus({ accessOnly: false, feeds: [reading], probes: [], previousPollUnanswered: false, now: POLL_AT }).incidents;

/** Cada Feed sem estado geral, com um problema aberto cuja última atualização é a data dada. */
const FEEDS_WITHOUT_OVERALL_STATE: [name: string, counted: string, readAt: (at: Date) => Promise<FeedReading>][] = [
    ['AWS', 'degraded', at => read(awsRssReader, AWS, [awsEvent(daysAgo(120), at)])],
    ['AWS com "Service disruption"', 'outage', at => read(awsRssReader, AWS, [awsEventTitled(AWS_DISRUPTION, daysAgo(120), at)])],
    ['Azure', 'outage', at => read(azureRssReader, AZURE, [azureProblem(at)])],
    ['Google Cloud', 'degraded', at => read(googleCloudReader, GOOGLE, [googleProblem(daysAgo(120), at)])],
    ['Google Cloud com `SERVICE_OUTAGE`', 'outage', at => read(googleCloudReader, GOOGLE, [googleProblem(daysAgo(120), at, 'SERVICE_OUTAGE')])],
    ['IBM', 'degraded', at => read(ibmRssReader, IBM, [rss(ibmProblem(daysAgo(120), at))])],
    ['Salesforce', 'degraded', at => readSalesforce([salesforceIncident({ created: daysAgo(120), updated: at })])],
    ['Salesforce com `major`', 'outage', at => readSalesforce([salesforceIncident({ created: daysAgo(120), updated: at, severity: 'major' })])],
];

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe.each(FEEDS_WITHOUT_OVERALL_STATE)('Dormant Incident em %s', (_name, counted, readAt) => {
    it('com exatamente 30 dias, o Incident conta', async () => {
        expect(await readAt(daysAgo(30))).toMatchObject({ declared: counted });
    });

    it('um instante depois dos 30 dias, deixa de contar', async () => {
        expect(await readAt(secondsLater(daysAgo(30), -1))).toMatchObject({ declared: 'operational' });
    });

    it('com 31 dias não conta e continua nos Recent Incidents', async () => {
        const reading = await readAt(daysAgo(31));

        expect(reading).toMatchObject({ declared: 'operational' });
        expect(recentIncidents(reading)).toHaveLength(1);
    });

    it('volta a contar sozinho quando o Provider o atualiza', async () => {
        expect(await readAt(daysAgo(40))).toMatchObject({ declared: 'operational' });
        expect(await readAt(daysAgo(1))).toMatchObject({ declared: counted });
    });
});

describe('data de referência', () => {
    it.each<[string, () => Promise<FeedReading>]>([
        ['Azure', () => read(azureRssReader, AZURE, [azureProblem(daysAgo(31))])],
        ['Google Cloud', () => read(googleCloudReader, GOOGLE, [googleProblem(daysAgo(31), null)])],
        ['IBM', () => read(ibmRssReader, IBM, [rss(ibmProblem(daysAgo(31), null))])],
        ['Salesforce', () => readSalesforce([salesforceIncident({ created: daysAgo(31), updated: null })])],
    ])('%s: sem atualização publicada, vale a data de criação', async (_name, readIt) => {
        expect(await readIt()).toMatchObject({ declared: 'operational' });
    });

    it.each<[string, () => Promise<FeedReading>]>([
        ['Google Cloud', () => read(googleCloudReader, GOOGLE, [googleProblem(daysAgo(30), null)])],
        ['IBM', () => read(ibmRssReader, IBM, [rss(ibmProblem(daysAgo(30), null))])],
        ['Salesforce', () => readSalesforce([salesforceIncident({ created: daysAgo(30), updated: null })])],
    ])('%s: sem atualização publicada, com exatamente 30 dias de criado, conta', async (_name, readIt) => {
        expect(await readIt()).toMatchObject({ declared: 'degraded' });
    });

    it('a última atualização publicada prevalece sobre uma criação antiga', async () => {
        const reading = await read(awsRssReader, AWS, [awsEvent(daysAgo(200), daysAgo(90), daysAgo(2))]);

        expect(reading.declared).toBe('degraded');
    });
});

describe('dedução do estado com vários Incidents', () => {
    it('um problema recente conta mesmo com um Dormant Incident ao lado', async () => {
        const reading = await read(ibmRssReader, IBM, [
            rss(
                ibmProblem(daysAgo(120), daysAgo(40)) +
                    ibmItem({ title: 'INVESTIGATING: IAM errors', guid: 'INC2', category: 'incident', created: daysAgo(1), updated: daysAgo(1) }),
            ),
        ]);

        expect(reading.declared).toBe('degraded');
        expect(recentIncidents(reading)).toHaveLength(2);
    });

    it('um Incident encerrado não conta, mesmo recente', async () => {
        const reading = await read(ibmRssReader, IBM, [
            rss(ibmItem({ title: 'RESOLVED: VPC errors', guid: 'INC1', category: 'incident', created: daysAgo(1), updated: daysAgo(1) })),
        ]);

        expect(reading.declared).toBe('operational');
    });
});

describe('Salesforce: a gravidade passa pela regra única', () => {
    it('um impacto `major` aberto de um Dormant Incident não leva a Outage', async () => {
        const reading = await readSalesforce([salesforceIncident({ created: daysAgo(90), updated: daysAgo(31), severity: 'major' })]);

        expect(reading.declared).toBe('operational');
        expect(recentIncidents(reading)).toHaveLength(1);
    });

    it('com exatamente 30 dias, o impacto `major` aberto ainda é Outage', async () => {
        const reading = await readSalesforce([salesforceIncident({ created: daysAgo(90), updated: daysAgo(30), severity: 'major' })]);

        expect(reading.declared).toBe('outage');
    });

    it('um `major` Dormant ao lado de um `minor` recente fica Degraded', async () => {
        const reading = await readSalesforce([
            salesforceIncident({ id: 1, created: daysAgo(90), updated: daysAgo(31), severity: 'major' }),
            salesforceIncident({ id: 2, created: daysAgo(1), updated: daysAgo(1), severity: 'minor' }),
        ]);

        expect(reading.declared).toBe('degraded');
    });

    it('o pior entre os que contam: um `major` recente prevalece sobre um `minor` recente', async () => {
        const reading = await readSalesforce([
            salesforceIncident({ id: 1, created: daysAgo(2), updated: daysAgo(2), severity: 'minor' }),
            salesforceIncident({ id: 2, created: daysAgo(1), updated: daysAgo(1), severity: 'major' }),
        ]);

        expect(reading.declared).toBe('outage');
    });

    it('uma atualização recente devolve o Outage', async () => {
        const reading = await readSalesforce([salesforceIncident({ created: daysAgo(90), updated: daysAgo(1), severity: 'major' })]);

        expect(reading.declared).toBe('outage');
    });
});

describe('manutenção em andamento Dormant', () => {
    it.each<[string, (at: Date) => Promise<FeedReading>]>([
        ['IBM', at => read(ibmRssReader, IBM, [rss(ibmMaintenance(daysAgo(120), at))])],
        ['Salesforce', at => readSalesforce([], [salesforceMaintenance(daysAgo(120), at)])],
    ])('%s: não deixa o Provider em Maintenance e continua listada, até ser atualizada', async (_name, readAt) => {
        const dormant = await readAt(daysAgo(31));

        expect(dormant).toMatchObject({ declared: 'operational' });
        expect(recentIncidents(dormant)).toHaveLength(1);
        expect(await readAt(daysAgo(30))).toMatchObject({ declared: 'maintenance' });
    });

    it('um Dormant Incident não impede a Maintenance de uma manutenção recente', async () => {
        const reading = await read(ibmRssReader, IBM, [rss(ibmProblem(daysAgo(90), daysAgo(40)) + ibmMaintenance(daysAgo(1), daysAgo(1)))]);

        expect(reading.declared).toBe('maintenance');
    });
});

describe('Providers com estado geral seguem o estado publicado, sem a regra', () => {
    const LONG_AFTER = new Date('2031-01-01T00:00:00Z');

    it('Statuspage.io: um problema parado há anos continua seguindo o indicador', async () => {
        const hostinger = { id: 'hostinger-feed', url: 'https://statuspage.hostinger.com' };
        const summary = JSON.parse(feedFixture('statuspage', 'hostinger-incident.json'));
        summary.status.indicator = 'major';

        const reading = await read(statuspageReader, hostinger, [summary], LONG_AFTER);

        expect(reading.declared).toBe('outage');
    });

    it('Statuspage.io: uma manutenção em andamento parada há anos continua dando Maintenance', async () => {
        const zoom = { id: 'zoom-feed', url: 'https://status.zoom.us' };

        const reading = await read(statuspageReader, zoom, [feedFixture('statuspage', 'zoom-maintenance-in-progress.json')], LONG_AFTER);

        expect(reading.declared).toBe('maintenance');
    });

    it('Heroku: as cores publicadas valem, mesmo com o Incident parado há anos', async () => {
        const heroku = { id: 'heroku-feed', url: FEED_URLS.heroku };

        const reading = await read(herokuReader, heroku, [feedFixture('heroku', 'open-incidents-2022-04-27.json')], LONG_AFTER);

        expect(reading.declared).toBe('degraded');
    });
});
