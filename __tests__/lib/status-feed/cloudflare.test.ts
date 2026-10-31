// @vitest-environment node
/**
 * Família `cloudflare` lida pela política de leitura, com a rede simulada e o relógio fixo.
 * A fixture é o `summary.json` real de 31/10/2026 (coleta nos Comments do Ticket 25): indicador `major`, nenhum Incident
 * aberto e só data centers em falha. Os casos da tabela são variações dela, com componentes reais do payload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFeed } from '@/lib/status-feed/read-policy';
import { cloudflareReader } from '@/lib/status-feed/readers/cloudflare';
import { decideProviderStatus } from '@/lib/provider-status';
import { feedFixture } from '../../helpers/status-feed';

const SOURCE = { id: 'cloudflare-feed', url: 'https://www.cloudflarestatus.com' };
const POLL_AT = new Date('2026-10-31T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBefore = (days: number) => new Date(POLL_AT.getTime() - days * DAY_MS).toISOString();

interface Component {
    id: string;
    name: string;
    status: string;
    group: boolean;
    group_id: string | null;
}

interface Summary {
    status: { indicator: string; description: string };
    components: Component[];
    incidents: unknown[];
    scheduled_maintenances: { id: string; status: string }[];
}

const realSummary = (): Summary => JSON.parse(feedFixture('cloudflare', 'major-data-centers-only.json'));

function realComponent(name: string): Component {
    const component = realSummary().components.find(c => c.name === name);
    if (!component) throw new Error(`Componente ${name} não está na fixture`);
    return component;
}

const CDN = realComponent('CDN/Cache');
const FIREWALL = realComponent('Firewall');
const DASHBOARD = realComponent('Dashboard');
const DALLAS = realComponent('Dallas, United States - (DFW)');

/** Incident aberto no formato real, baseado no que a Cloudflare publicou em outubro de 2026. */
const openIncident = (impact: string, components: Component[], overrides: object = {}) => ({
    id: 'inc1',
    name: 'Elevated errors',
    status: 'investigating',
    impact,
    shortlink: 'https://stspg.io/inc1',
    created_at: daysBefore(0),
    updated_at: daysBefore(0),
    components,
    incident_updates: [{ body: 'Cloudflare is investigating this issue.' }],
    ...overrides,
});

const ongoingMaintenance = (components: Component[], overrides: object = {}) => ({
    id: 'mnt1',
    name: 'DFW (Dallas) on 2026-10-31',
    status: 'in_progress',
    impact: 'maintenance',
    created_at: daysBefore(1),
    updated_at: daysBefore(0),
    scheduled_for: daysBefore(0),
    components,
    incident_updates: [],
    ...overrides,
});

/** A fixture real com as trocas do caso. */
const summaryWith = (changes: Partial<Summary>): Summary => ({ ...realSummary(), scheduled_maintenances: [], ...changes });

/** A fixture real com componentes marcados em outro estado. */
function withComponentStatus(statuses: Record<string, string>): Component[] {
    return realSummary().components.map(c => (c.name in statuses ? { ...c, status: statuses[c.name] } : c));
}

function respondWith(body: string) {
    const fetchMock = vi.fn(async () => new Response(body));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

async function read(summary: object) {
    respondWith(JSON.stringify(summary));
    const reading = await readFeed(SOURCE, cloudflareReader, POLL_AT);
    if (!reading.read) throw new Error('Feed não lido');
    return reading;
}

const decide = (reading: Awaited<ReturnType<typeof read>>) =>
    decideProviderStatus({ accessOnly: false, feeds: [reading], probes: [], previousPollUnanswered: false, now: POLL_AT });

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('payload real: indicador major, nenhum Incident aberto e só data centers em falha', () => {
    it('a fixture tem mesmo esse formato', () => {
        const { status, incidents, components } = realSummary();
        const servicesGroup = components.find(c => c.group && c.name === 'Cloudflare Sites and Services');
        const failing = components.filter(c => !c.group && ['partial_outage', 'major_outage'].includes(c.status));

        expect(status.indicator).toBe('major');
        expect(incidents).toEqual([]);
        expect(failing.length).toBeGreaterThan(0);
        expect(failing.some(c => c.group_id === servicesGroup?.id)).toBe(false);
    });

    it('a Cloudflare fica Operational, com as manutenções agendadas na lista e na linha de Upcoming Maintenance', async () => {
        const reading = await read(realSummary());

        expect(reading.declared).toBe('operational');
        expect(reading.incidents).toHaveLength(25);
        expect(reading.incidents.every(i => i.kind === 'maintenance' && i.status === 'scheduled')).toBe(true);

        const decision = decide(reading);
        expect(decision.status).toBe('operational');
        expect(decision.upcomingMaintenance?.count).toBe(25);
    });
});

describe('o estado geral publicado não vale', () => {
    it.each(['none', 'minor', 'major', 'critical', 'maintenance', 'um-valor-novo'])('indicador %s sem nada a declarar é Operational', async indicator => {
        const reading = await read(summaryWith({ status: { indicator, description: '' } }));

        expect(reading.declared).toBe('operational');
    });

    it('indicador none com Incident major em Core Service é Outage', async () => {
        const reading = await read(summaryWith({ status: { indicator: 'none', description: '' }, incidents: [openIncident('major', [CDN])] }));

        expect(reading.declared).toBe('outage');
    });
});

describe('classificação de um Incident aberto', () => {
    it.each<[string, string, Component[], string]>([
        ['critical', 'um Core Service', [CDN], 'outage'],
        ['major', 'um Core Service', [CDN], 'outage'],
        ['minor', 'um Core Service', [CDN], 'degraded'],
        ['none', 'um Core Service', [CDN], 'operational'],
        ['maintenance', 'um Core Service', [CDN], 'operational'],
        ['critical', 'só serviço fora dos Core Services', [DASHBOARD], 'degraded'],
        ['major', 'só serviço fora dos Core Services', [DASHBOARD], 'degraded'],
        ['minor', 'só serviço fora dos Core Services', [DASHBOARD], 'operational'],
        ['none', 'só serviço fora dos Core Services', [DASHBOARD], 'operational'],
        ['maintenance', 'só serviço fora dos Core Services', [DASHBOARD], 'operational'],
        ['critical', 'só data centers', [DALLAS], 'operational'],
        ['major', 'só data centers', [DALLAS], 'operational'],
        ['minor', 'só data centers', [DALLAS], 'operational'],
        ['none', 'só data centers', [DALLAS], 'operational'],
        ['maintenance', 'só data centers', [DALLAS], 'operational'],
    ])('impacto %s em %s', async (impact, _reach, components, declared) => {
        const reading = await read(summaryWith({ incidents: [openIncident(impact, components)] }));

        expect(reading.declared).toBe(declared);
        expect(reading.incidents).toHaveLength(1);
        expect(reading.incidents[0]).toMatchObject({ externalId: 'inc1', kind: 'problem', status: 'investigating' });
    });

    it.each(['CDN/Cache', 'Firewall', 'Bot Management', 'Authoritative DNS', 'Recursive DNS', 'Network', 'Workers'])('%s é Core Service', async name => {
        const reading = await read(summaryWith({ incidents: [openIncident('major', [realComponent(name)])] }));

        expect(reading.declared).toBe('outage');
    });

    it.each([
        ['critical', 'outage'],
        ['major', 'outage'],
        ['minor', 'degraded'],
        ['none', 'operational'],
        ['maintenance', 'operational'],
    ])('Incident sem nenhum componente, impacto %s, conta como Core Service', async (impact, declared) => {
        const reading = await read(summaryWith({ incidents: [openIncident(impact, [])] }));

        expect(reading.declared).toBe(declared);
    });

    it('Incident sem a lista de componentes conta como Core Service', async () => {
        const reading = await read(summaryWith({ incidents: [openIncident('minor', [], { components: undefined })] }));

        expect(reading.declared).toBe('degraded');
    });

    it.each([
        ['major', 'outage'],
        ['minor', 'degraded'],
    ])('Incident %s em Core Service e data centers segue a coluna do Core Service', async (impact, declared) => {
        const reading = await read(summaryWith({ incidents: [openIncident(impact, [DALLAS, CDN])] }));

        expect(reading.declared).toBe(declared);
    });

    it.each([
        ['major', 'degraded'],
        ['minor', 'operational'],
    ])('Incident %s em serviço fora dos Core Services e data centers segue a coluna do serviço', async (impact, declared) => {
        const reading = await read(summaryWith({ incidents: [openIncident(impact, [DALLAS, DASHBOARD])] }));

        expect(reading.declared).toBe(declared);
    });

    it('um nome de Core Service fora do grupo de serviços é data center', async () => {
        const reading = await read(summaryWith({ incidents: [openIncident('major', [{ ...DALLAS, name: 'Network' }])] }));

        expect(reading.declared).toBe('operational');
    });

    it('vale o pior entre os Incidents abertos, e todos seguem na lista', async () => {
        const reading = await read(
            summaryWith({
                incidents: [openIncident('minor', [DALLAS]), openIncident('major', [DASHBOARD], { id: 'inc2' }), openIncident('critical', [CDN], { id: 'inc3' })],
            }),
        );

        expect(reading.declared).toBe('outage');
        expect(reading.incidents.map(i => i.externalId)).toEqual(['inc1', 'inc2', 'inc3']);
    });

    it('Incident encerrado não conta', async () => {
        const reading = await read(summaryWith({ incidents: [openIncident('critical', [CDN], { status: 'resolved' })] }));

        expect(reading.declared).toBe('operational');
    });
});

describe('Core Service marcado em falha, sem Incident', () => {
    it.each([
        ['major_outage', 'outage'],
        ['partial_outage', 'outage'],
        ['degraded_performance', 'degraded'],
        ['under_maintenance', 'operational'],
        ['operational', 'operational'],
    ])('%s declara %s', async (status, declared) => {
        const reading = await read(summaryWith({ components: withComponentStatus({ Firewall: status }) }));

        expect(reading.declared).toBe(declared);
    });

    it('serviço fora dos Core Services marcado em falha não muda o estado', async () => {
        const reading = await read(summaryWith({ components: withComponentStatus({ Dashboard: 'major_outage' }) }));

        expect(reading.declared).toBe('operational');
    });

    it('soma com os Incidents: vale o pior dos dois', async () => {
        const reading = await read(
            summaryWith({
                components: withComponentStatus({ Firewall: 'partial_outage' }),
                incidents: [openIncident('minor', [CDN])],
            }),
        );

        expect(reading.declared).toBe('outage');
    });

    it('com Incident aberto no próprio Core Service, vale a tabela', async () => {
        const reading = await read(
            summaryWith({
                components: withComponentStatus({ 'CDN/Cache': 'partial_outage' }),
                incidents: [openIncident('minor', [CDN])],
            }),
        );

        expect(reading.declared).toBe('degraded');
    });

    it.each([
        ['none', 'major_outage', 'outage'],
        ['maintenance', 'partial_outage', 'outage'],
        ['none', 'degraded_performance', 'degraded'],
    ])('um Incident %s, que não muda o estado, não tira o Core Service em %s da regra', async (impact, status, declared) => {
        const reading = await read(
            summaryWith({
                components: withComponentStatus({ 'CDN/Cache': status }),
                incidents: [openIncident(impact, [CDN])],
            }),
        );

        expect(reading.declared).toBe(declared);
    });

    it('um Incident encerrado no Core Service não o tira da regra', async () => {
        const reading = await read(
            summaryWith({
                components: withComponentStatus({ 'CDN/Cache': 'major_outage' }),
                incidents: [openIncident('minor', [CDN], { status: 'resolved' })],
            }),
        );

        expect(reading.declared).toBe('outage');
    });

    it('um Dormant Incident no Core Service não o tira da regra', async () => {
        const reading = await read(
            summaryWith({
                components: withComponentStatus({ 'CDN/Cache': 'major_outage' }),
                incidents: [openIncident('minor', [CDN], { created_at: daysBefore(60), updated_at: daysBefore(31) })],
            }),
        );

        expect(reading.declared).toBe('outage');
    });

    it('prevalece sobre uma manutenção em andamento', async () => {
        const reading = await read(
            summaryWith({
                components: withComponentStatus({ Firewall: 'degraded_performance' }),
                scheduled_maintenances: [ongoingMaintenance([DASHBOARD])] as Summary['scheduled_maintenances'],
            }),
        );

        expect(reading.declared).toBe('degraded');
    });
});

describe('manutenção da Cloudflare', () => {
    const withMaintenance = (...maintenances: object[]) => summaryWith({ scheduled_maintenances: maintenances as Summary['scheduled_maintenances'] });

    it('em andamento só de data centers não leva a Maintenance e continua na lista', async () => {
        const reading = await read(withMaintenance(ongoingMaintenance([DALLAS])));

        expect(reading.declared).toBe('operational');
        expect(reading.incidents[0]).toMatchObject({ externalId: 'mnt1', kind: 'maintenance', status: 'in_progress' });
    });

    it.each<[string, Component[]]>([
        ['um serviço fora dos Core Services', [DASHBOARD]],
        ['um Core Service', [FIREWALL]],
        ['um serviço e data centers', [DALLAS, DASHBOARD]],
        ['nenhum componente', []],
    ])('em andamento em %s leva a Maintenance', async (_case, components) => {
        const reading = await read(withMaintenance(ongoingMaintenance(components)));

        expect(reading.declared).toBe('maintenance');
    });

    it('sem a lista de componentes leva a Maintenance', async () => {
        const reading = await read(withMaintenance(ongoingMaintenance([], { components: undefined })));

        expect(reading.declared).toBe('maintenance');
    });

    it('na fase verifying ainda é em andamento', async () => {
        const reading = await read(withMaintenance(ongoingMaintenance([DASHBOARD], { status: 'verifying' })));

        expect(reading.declared).toBe('maintenance');
    });

    it('agendada num serviço não leva a Maintenance', async () => {
        const reading = await read(withMaintenance(ongoingMaintenance([DASHBOARD], { status: 'scheduled' })));

        expect(reading.declared).toBe('operational');
    });

    it('nunca prevalece sobre um problema', async () => {
        const reading = await read({ ...withMaintenance(ongoingMaintenance([DASHBOARD])), incidents: [openIncident('minor', [CDN])] });

        expect(reading.declared).toBe('degraded');
    });

    it('um Dormant Incident de manutenção não leva a Maintenance', async () => {
        const reading = await read(withMaintenance(ongoingMaintenance([DASHBOARD], { created_at: daysBefore(40), updated_at: daysBefore(31) })));

        expect(reading.declared).toBe('operational');
        expect(reading.incidents).toHaveLength(1);
    });
});

describe('Dormant Incident', () => {
    it('com 31 dias sem novidade não conta, e segue na lista', async () => {
        const reading = await read(summaryWith({ incidents: [openIncident('critical', [CDN], { created_at: daysBefore(60), updated_at: daysBefore(31) })] }));

        expect(reading.declared).toBe('operational');
        expect(reading.incidents[0]).toMatchObject({ externalId: 'inc1', status: 'investigating' });
    });

    it('com 30 dias exatos ainda conta', async () => {
        const reading = await read(summaryWith({ incidents: [openIncident('critical', [CDN], { created_at: daysBefore(60), updated_at: daysBefore(30) })] }));

        expect(reading.declared).toBe('outage');
    });
});

describe('conteúdo inesperado vira Feed não lido, com registro no log', () => {
    async function expectUnread(summary: object, logged: string | RegExp = '') {
        respondWith(JSON.stringify(summary));

        const reading = await readFeed(SOURCE, cloudflareReader, POLL_AT);

        expect(reading).toEqual({ read: false, answered: true, gotHttpResponse: true });
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('cloudflare-feed'), expect.anything());
        const [, error] = vi.mocked(console.error).mock.calls[0];
        expect(String(error instanceof Error ? error.message : error)).toMatch(logged);
    }

    it.each(['CDN/Cache', 'Firewall', 'Bot Management', 'Authoritative DNS', 'Recursive DNS', 'Network', 'Workers'])('sem o Core Service %s', async name => {
        const components = realSummary().components.filter(c => c.name !== name);

        await expectUnread(summaryWith({ components }), name);
    });

    it('Core Service renomeado', async () => {
        const components = realSummary().components.map(c => (c.name === 'Firewall' ? { ...c, name: 'WAF' } : c));

        await expectUnread(summaryWith({ components }), 'Firewall');
    });

    it('Core Service fora do grupo de serviços', async () => {
        const components = realSummary().components.map(c => (c.name === 'Firewall' ? { ...c, group_id: DALLAS.group_id } : c));

        await expectUnread(summaryWith({ components }), 'Firewall');
    });

    it('grupo de serviços com outro nome', async () => {
        const components = realSummary().components.map(c => (c.name === 'Cloudflare Sites and Services' ? { ...c, name: 'Services' } : c));

        await expectUnread(summaryWith({ components }), 'Cloudflare Sites and Services');
    });

    it('sem a lista de componentes', async () => {
        await expectUnread({ ...summaryWith({}), components: undefined });
    });

    it('impacto desconhecido', async () => {
        await expectUnread(summaryWith({ incidents: [openIncident('catastrophic', [CDN])] }));
    });

    it('Incident sem impacto', async () => {
        await expectUnread(summaryWith({ incidents: [openIncident('minor', [CDN], { impact: undefined })] }));
    });

    it('estado desconhecido em Core Service', async () => {
        await expectUnread(summaryWith({ components: withComponentStatus({ Network: 'exploded' }) }));
    });

    it('item fora do formato da família Statuspage.io', async () => {
        await expectUnread(summaryWith({ incidents: [openIncident('minor', [CDN], { status: 'exploded' })] }));
    });

    it('HTML no lugar de JSON', async () => {
        respondWith('<!DOCTYPE html><html></html>');

        const reading = await readFeed(SOURCE, cloudflareReader, POLL_AT);

        expect(reading).toEqual({ read: false, answered: true, gotHttpResponse: true });
    });
});

describe('endereço do Feed', () => {
    it('a URL do catálogo é lida em summary.json', async () => {
        const fetchMock = respondWith(JSON.stringify(realSummary()));

        await readFeed(SOURCE, cloudflareReader, POLL_AT);

        expect(String((fetchMock.mock.calls as unknown[][])[0][0])).toBe('https://www.cloudflarestatus.com/api/v2/summary.json');
    });
});
