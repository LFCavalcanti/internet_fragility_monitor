// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { decideProviderStatus, type FeedReading } from '@/lib/provider-status';
import type { DeclaredStatus, IncidentData, MaintenanceIncident, ProblemIncident } from '@/lib/status-feed/types';
import { hoursBefore } from '../helpers/time';

const now = new Date('2026-10-26T15:00:00Z');

const problem = (overrides: Partial<ProblemIncident> = {}): ProblemIncident => ({
    kind: 'problem',
    title: 'Elevated errors',
    status: 'investigating',
    createdAt: new Date('2026-10-26T14:00:00Z'),
    ...overrides,
});

const maintenance = (overrides: Partial<MaintenanceIncident> = {}): MaintenanceIncident => ({
    kind: 'maintenance',
    title: 'Datacenter maintenance',
    status: 'scheduled',
    createdAt: new Date('2026-10-20T10:00:00Z'),
    scheduledFor: new Date('2026-10-27T02:00:00Z'),
    ...overrides,
});

const feed = (
    declared: DeclaredStatus,
    incidents: IncidentData[] = [],
): FeedReading => ({ read: true, declared, incidents });

describe('decideProviderStatus', () => {
    it('Cloudflare em 26/10/2026: Outage declarado com 25 manutenções agendadas continua Outage', () => {
        const scheduled = Array.from({ length: 25 }, (_, i) =>
            maintenance({
                title: `Maintenance ${i + 1}`,
                scheduledFor: new Date(Date.UTC(2026, 9, 27 + (i % 2), 1 + i)),
            }),
        );
        const outage = problem({ title: 'Partial System Outage' });

        const decision = decideProviderStatus({
            accessOnly: false,
            feeds: [feed('outage', [outage, ...scheduled])],
            probes: [],
            previousPollUnanswered: false,
            now,
        });

        expect(decision.status).toBe('outage');
        expect(decision.upcomingMaintenance).toEqual({
            count: 25,
            next: new Date('2026-10-27T01:00:00Z'),
        });
        expect(decision.incidents.map(i => i.title)).toEqual(['Partial System Outage']);
    });

    it('manutenção agendada não muda Operational e vira Upcoming Maintenance', () => {
        const decision = decideProviderStatus({
            accessOnly: false,
            feeds: [feed('operational', [maintenance()])],
            probes: [],
            previousPollUnanswered: false,
            now,
        });

        expect(decision.status).toBe('operational');
        expect(decision.upcomingMaintenance).toEqual({ count: 1, next: new Date('2026-10-27T02:00:00Z') });
        expect(decision.incidents).toEqual([]);
    });

    it('um Feed que declara Maintenance deixa o Provider em Maintenance, com a manutenção na lista', () => {
        const ongoing = maintenance({ status: 'in_progress', title: 'Network upgrade' });
        const decision = decideProviderStatus({
            accessOnly: false,
            feeds: [feed('maintenance', [ongoing])],
            probes: [],
            previousPollUnanswered: false,
            now,
        });

        expect(decision.status).toBe('maintenance');
        expect(decision.upcomingMaintenance).toBeNull();
        expect(decision.incidents.map(i => i.title)).toEqual(['Network upgrade']);
    });

    it('o estado vem só do declarado: uma manutenção em andamento num Feed Operational fica na lista, sem mudar o estado', () => {
        const ongoing = maintenance({ status: 'in_progress', title: 'Network upgrade' });
        const decision = decideProviderStatus({
            accessOnly: false,
            feeds: [feed('operational', [ongoing])],
            probes: [],
            previousPollUnanswered: false,
            now,
        });

        expect(decision.status).toBe('operational');
        expect(decision.incidents.map(i => i.title)).toEqual(['Network upgrade']);
    });

    it('Maintenance declarada por um Feed nunca prevalece sobre Degraded nem Outage de outro', () => {
        const ongoing = maintenance({ status: 'in_progress' });
        for (const declared of ['degraded', 'outage'] as const) {
            for (const feeds of [
                [feed('maintenance', [ongoing]), feed(declared)],
                [feed(declared), feed('maintenance', [ongoing])],
            ]) {
                const decision = decideProviderStatus({ accessOnly: false, feeds, probes: [], previousPollUnanswered: false, now });
                expect(decision.status).toBe(declared);
            }
        }
    });

    it('manutenção completed não aparece nem afeta o estado', () => {
        const done = maintenance({ status: 'completed', title: 'Old maintenance' });
        const decision = decideProviderStatus({
            accessOnly: false,
            feeds: [feed('operational', [done])],
            probes: [],
            previousPollUnanswered: false,
            now,
        });

        expect(decision.status).toBe('operational');
        expect(decision.incidents).toEqual([]);
        expect(decision.upcomingMaintenance).toBeNull();
    });

    it('sem manutenção agendada não há Upcoming Maintenance', () => {
        const decision = decideProviderStatus({
            accessOnly: false,
            feeds: [feed('operational', [problem({ status: 'resolved' })])],
            probes: [],
            previousPollUnanswered: false,
            now,
        });
        expect(decision.upcomingMaintenance).toBeNull();
    });

    it('manutenção agendada sem data marcada conta, e a próxima data vem das que têm data', () => {
        const decision = decideProviderStatus({
            accessOnly: false,
            feeds: [feed('operational', [
                maintenance({ scheduledFor: undefined }),
                maintenance({ scheduledFor: new Date('2026-10-29T00:00:00Z') }),
            ])],
            probes: [],
            previousPollUnanswered: false,
            now,
        });
        expect(decision.upcomingMaintenance).toEqual({ count: 2, next: new Date('2026-10-29T00:00:00Z') });
    });

    describe('Upcoming Maintenance usa o relógio', () => {
        it('manutenção ainda scheduled com data já passada não conta, e a próxima data nunca fica no passado', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [feed('operational', [
                    maintenance({ title: 'Atrasada', scheduledFor: new Date('2026-10-26T12:00:00Z') }),
                    maintenance({ title: 'Futura', scheduledFor: new Date('2026-10-28T03:00:00Z') }),
                ])],
                probes: [],
                previousPollUnanswered: false,
                now,
            });
            expect(decision.upcomingMaintenance).toEqual({ count: 1, next: new Date('2026-10-28T03:00:00Z') });
        });

        it('manutenção marcada para agora já começou: não é Upcoming Maintenance', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [feed('operational', [maintenance({ scheduledFor: now })])],
                probes: [],
                previousPollUnanswered: false,
                now,
            });
            expect(decision.upcomingMaintenance).toBeNull();
        });

        it('a mesma leitura muda com o relógio: depois da data marcada, a manutenção sai da conta', () => {
            const feeds = [feed('operational', [maintenance({ scheduledFor: new Date('2026-10-27T02:00:00Z') })])];
            const before = decideProviderStatus({ accessOnly: false, feeds, probes: [], previousPollUnanswered: false, now });
            const after = decideProviderStatus({
                accessOnly: false,
                feeds,
                probes: [],
                previousPollUnanswered: false,
                now: new Date('2026-10-27T02:30:00Z'),
            });
            expect(before.upcomingMaintenance).toEqual({ count: 1, next: new Date('2026-10-27T02:00:00Z') });
            expect(after.upcomingMaintenance).toBeNull();
        });
    });

    describe('precedência Down, Outage, Degraded, Maintenance, Operational', () => {
        const ongoing = maintenance({ status: 'in_progress' });

        it('o pior estado declarado entre os Feeds lidos vence', () => {
            const decide = (...feeds: FeedReading[]) =>
                decideProviderStatus({ accessOnly: false, feeds, probes: [], previousPollUnanswered: false, now }).status;

            expect(decide(feed('operational'), feed('outage'), feed('degraded'))).toBe('outage');
            expect(decide(feed('operational'), feed('degraded'))).toBe('degraded');
            expect(decide(feed('operational'), feed('maintenance', [ongoing]))).toBe('maintenance');
            expect(decide(feed('degraded'), feed('maintenance', [ongoing]))).toBe('degraded');
            expect(decide(feed('operational'), feed('operational'))).toBe('operational');
        });

        it('Down vence tudo: nenhuma fonte respondeu neste Poll e no anterior', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [{ read: false, answered: false }],
                probes: [false],
                previousPollUnanswered: true,
                now,
            });
            expect(decision.status).toBe('down');
        });

        it('sem resposta só neste Poll é Unreachable, não Down', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [{ read: false, answered: false }],
                probes: [false],
                previousPollUnanswered: false,
                now,
            });
            expect(decision.status).toBe('unreachable');
        });

        it('nenhum Feed lido mas um Probe respondeu é Unreachable, mesmo com Poll anterior sem resposta', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [{ read: false, answered: false }],
                probes: [true],
                previousPollUnanswered: true,
                now,
            });
            expect(decision.status).toBe('unreachable');
        });

        it('Provider só com Probes fica Operational quando algum Probe responde', () => {
            const decision = decideProviderStatus({
                accessOnly: true,
                feeds: [],
                probes: [false, true],
                previousPollUnanswered: false,
                now,
            });
            expect(decision.status).toBe('operational');
        });

        it('Provider só com Probes leva a marca de "só acesso"; com Feed, não', () => {
            const accessOnly = decideProviderStatus({ accessOnly: true, feeds: [], probes: [true, false], previousPollUnanswered: false, now });
            const withFeed = decideProviderStatus({ accessOnly: false, feeds: [feed('operational')], probes: [], previousPollUnanswered: false, now });
            const unreadFeed = decideProviderStatus({ accessOnly: false, feeds: [{ read: false, answered: false }], probes: [true], previousPollUnanswered: false, now });

            expect(accessOnly).toMatchObject({ status: 'operational', accessOnly: true });
            expect(withFeed.accessOnly).toBe(false);
            expect(unreadFeed.accessOnly).toBe(false);
        });

        it('Provider só com Probes sem nenhuma resposta fica Unreachable, ainda com a marca de "só acesso"', () => {
            const decision = decideProviderStatus({ accessOnly: true, feeds: [], probes: [false, false], previousPollUnanswered: false, now });

            expect(decision).toMatchObject({ status: 'unreachable', accessOnly: true });
        });

        it('com a marca de "só acesso", nenhuma leitura de Feed conta: nem estado declarado nem Incidents', () => {
            const decision = decideProviderStatus({
                accessOnly: true,
                feeds: [feed('outage', [problem(), maintenance({ status: 'in_progress' }), maintenance()])],
                probes: [true],
                previousPollUnanswered: false,
                now,
            });

            expect(decision).toEqual({ status: 'operational', incidents: [], upcomingMaintenance: null, accessOnly: true, partialReading: null });
        });

        it('Feed não lido ao lado de Feed lido: o estado vem do lido', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [{ read: false, answered: false }, feed('degraded')],
                probes: [],
                previousPollUnanswered: true,
                now,
            });
            expect(decision.status).toBe('degraded');
        });

        it('um Feed que respondeu sem poder ser lido impede Down: alguma fonte respondeu neste Poll', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [{ read: false, answered: true }, { read: false, answered: false }],
                probes: [false],
                previousPollUnanswered: true,
                now,
            });
            expect(decision.status).toBe('unreachable');
        });

        it('Provider só com Probes sem resposta por dois Polls seguidos é Down, ainda com a marca de "só acesso"', () => {
            const decision = decideProviderStatus({ accessOnly: true, feeds: [], probes: [false, false], previousPollUnanswered: true, now });

            expect(decision).toMatchObject({ status: 'down', accessOnly: true });
        });

        it('Provider sem nenhuma fonte ativa nunca é Down: não houve o que responder', () => {
            const decision = decideProviderStatus({ accessOnly: true, feeds: [], probes: [], previousPollUnanswered: true, now });

            expect(decision.status).toBe('unreachable');
        });

        it('em Down, os Incidents gravados do Feed não lido seguem na lista, sem Upcoming Maintenance', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [{ read: false, answered: false, incidents: [problem(), maintenance()] }],
                probes: [false],
                previousPollUnanswered: true,
                now,
            });

            expect(decision).toMatchObject({ status: 'down', upcomingMaintenance: null, partialReading: null });
            expect(decision.incidents.map(i => i.title)).toEqual(['Elevated errors']);
        });

        it('Feeds e Probes sem resposta por dois Polls seguidos são Down', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [{ read: false, answered: false }, { read: false, answered: false }],
                probes: [false],
                previousPollUnanswered: true,
                now,
            });
            expect(decision.status).toBe('down');
        });
    });

    describe('vários Feeds e Partial Reading', () => {
        const decide = (...feeds: FeedReading[]) =>
            decideProviderStatus({ accessOnly: false, feeds, probes: [], previousPollUnanswered: false, now });

        it('dois Feeds lidos com estados diferentes: vence o pior, os Incidents se somam e não há marca', () => {
            const decision = decide(
                feed('operational', [problem({ title: 'Do Feed saudável', status: 'monitoring' })]),
                feed('outage', [problem({ title: 'Do Feed em Outage' })]),
            );

            expect(decision.status).toBe('outage');
            expect(decision.incidents.map(i => i.title).sort()).toEqual(['Do Feed em Outage', 'Do Feed saudável']);
            expect(decision.partialReading).toBeNull();
        });

        it('as manutenções agendadas de todos os Feeds lidos entram na Upcoming Maintenance', () => {
            const decision = decide(
                feed('operational', [maintenance({ scheduledFor: new Date('2026-10-29T00:00:00Z') })]),
                feed('operational', [maintenance({ scheduledFor: new Date('2026-10-28T00:00:00Z') })]),
            );

            expect(decision.upcomingMaintenance).toEqual({ count: 2, next: new Date('2026-10-28T00:00:00Z') });
        });

        it('um Feed lido e outro não: o estado vem do lido, com a marca de quantos ficaram sem leitura', () => {
            const decision = decide(feed('degraded'), { read: false, answered: false });

            expect(decision.status).toBe('degraded');
            expect(decision.partialReading).toEqual({ unread: 1, total: 2 });
        });

        it('a marca conta os Feeds não lidos entre todos', () => {
            expect(decide(feed('operational'), { read: false, answered: false }, { read: false, answered: false }).partialReading).toEqual({ unread: 2, total: 3 });
        });

        it('todos os Feeds lidos não têm marca', () => {
            expect(decide(feed('operational'), feed('operational')).partialReading).toBeNull();
        });

        it('nenhum Feed lido é Unreachable, não Partial Reading', () => {
            const decision = decide({ read: false, answered: false }, { read: false, answered: false });

            expect(decision.status).toBe('unreachable');
            expect(decision.partialReading).toBeNull();
        });
    });

    describe('Recent Incidents', () => {
        const decide = (incidents: IncidentData[], declared: DeclaredStatus = 'operational') =>
            decideProviderStatus({ accessOnly: false, feeds: [feed(declared, incidents)], probes: [], previousPollUnanswered: false, now });
        const titles = (incidents: IncidentData[]) => incidents.map(i => i.title);

        it('Incident ativo do Google Cloud com mais de 24 horas aparece', () => {
            const long = problem({ title: 'Cloud Run: elevated latency', createdAt: hoursBefore(now, 30) });
            expect(titles(decide([long], 'degraded').incidents)).toEqual(['Cloud Run: elevated latency']);
        });

        it('Incident ativo aparece de qualquer idade', () => {
            const ancient = problem({ title: 'Region disruption', status: 'identified', createdAt: hoursBefore(now, 24 * 200) });
            expect(titles(decide([ancient], 'degraded').incidents)).toEqual(['Region disruption']);
        });

        it('resolvido há 47 horas aparece e há 49 horas não', () => {
            const recent = problem({ title: 'Resolved 47h', status: 'resolved', createdAt: hoursBefore(now, 60), resolvedAt: hoursBefore(now, 47) });
            const old = problem({ title: 'Resolved 49h', status: 'resolved', createdAt: hoursBefore(now, 60), resolvedAt: hoursBefore(now, 49) });
            expect(titles(decide([recent, old]).incidents)).toEqual(['Resolved 47h']);
        });

        it('a janela de 48 horas conta da resolução, não da criação', () => {
            const longOne = problem({ title: 'Long outage', status: 'resolved', createdAt: hoursBefore(now, 24 * 5), resolvedAt: hoursBefore(now, 2) });
            expect(titles(decide([longOne]).incidents)).toEqual(['Long outage']);
        });

        it('resolvido sem hora de resolução conta a janela da criação', () => {
            const recent = problem({ title: 'Recent', status: 'resolved', createdAt: hoursBefore(now, 47) });
            const old = problem({ title: 'Old', status: 'resolved', createdAt: hoursBefore(now, 49) });
            expect(titles(decide([recent, old]).incidents)).toEqual(['Recent']);
        });

        it('manutenção em andamento anunciada há dias aparece e o card mostra Maintenance', () => {
            const ongoing = maintenance({
                title: 'Datacenter migration',
                status: 'in_progress',
                createdAt: hoursBefore(now, 24 * 6),
                scheduledFor: hoursBefore(now, 3),
            });
            const decision = decide([ongoing], 'maintenance');
            expect(decision.status).toBe('maintenance');
            expect(titles(decision.incidents)).toEqual(['Datacenter migration']);
        });

        it('manutenção agendada e completed recente não entram nos Recent Incidents', () => {
            const done = maintenance({ title: 'Done', status: 'completed', createdAt: hoursBefore(now, 5), resolvedAt: hoursBefore(now, 1) });
            const upcoming = maintenance({ title: 'Upcoming', createdAt: hoursBefore(now, 5) });
            expect(decide([done, upcoming]).incidents).toEqual([]);
        });

        it('ativos vêm antes dos resolvidos, cada grupo do mais novo para o mais antigo', () => {
            const resolvedNew = problem({ title: 'Resolved new', status: 'resolved', createdAt: hoursBefore(now, 3), resolvedAt: hoursBefore(now, 1) });
            const activeOld = problem({ title: 'Active old', createdAt: hoursBefore(now, 40) });
            const resolvedOld = problem({ title: 'Resolved old', status: 'resolved', createdAt: hoursBefore(now, 20), resolvedAt: hoursBefore(now, 10) });
            const activeNew = maintenance({ title: 'Active new', status: 'in_progress', createdAt: hoursBefore(now, 2) });
            const resolvedNewer = problem({ title: 'Resolved newer', status: 'resolved', createdAt: hoursBefore(now, 30), resolvedAt: hoursBefore(now, 0.5) });
            expect(titles(decide([resolvedNew, activeOld, resolvedOld, activeNew], 'degraded').incidents)).toEqual([
                'Active new',
                'Active old',
                'Resolved new',
            ]);
            // Resolvidos ordenados pela resolução: o resolvido há meia hora vem antes, mesmo criado antes.
            expect(titles(decide([resolvedNew, resolvedOld, resolvedNewer]).incidents)).toEqual([
                'Resolved newer',
                'Resolved new',
                'Resolved old',
            ]);
        });

        it('os resolvidos completam a lista até 3 itens', () => {
            const resolved = [1, 2, 3, 4].map(h =>
                problem({ title: `Resolved ${h}`, status: 'resolved', createdAt: hoursBefore(now, h + 1), resolvedAt: hoursBefore(now, h) }),
            );
            const active = problem({ title: 'Active', createdAt: hoursBefore(now, 10) });
            expect(titles(decide([...resolved, active], 'degraded').incidents)).toEqual(['Active', 'Resolved 1', 'Resolved 2']);
        });

        it('um sexto Incident ativo não é cortado, e nenhum resolvido entra quando os ativos já passam de 3', () => {
            const active = [1, 2, 3, 4, 5, 6].map(h => problem({ title: `Active ${h}`, createdAt: hoursBefore(now, h) }));
            const resolved = problem({ title: 'Resolved', status: 'resolved', resolvedAt: hoursBefore(now, 1) });
            expect(titles(decide([...active, resolved], 'outage').incidents)).toEqual([
                'Active 1',
                'Active 2',
                'Active 3',
                'Active 4',
                'Active 5',
                'Active 6',
            ]);
        });
    });

    describe('Unreachable', () => {
        it('falha de leitura do único Feed, sem Probes, é Unreachable e não Outage', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [{ read: false, answered: false }],
                probes: [],
                previousPollUnanswered: false,
                now,
            });
            expect(decision.status).toBe('unreachable');
            expect(decision.incidents).toEqual([]);
            expect(decision.upcomingMaintenance).toBeNull();
        });

        it('mantém os Recent Incidents já gravados do Feed não lido, sem virar estado nem Upcoming Maintenance', () => {
            const active = problem({ title: 'Elevated errors', status: 'identified' });
            const resolved = problem({ title: 'API latency', status: 'resolved' });
            const ongoing = maintenance({ title: 'Network upgrade', status: 'in_progress' });

            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [{ read: false, answered: false, incidents: [active, resolved, ongoing, maintenance()] }],
                probes: [],
                previousPollUnanswered: false,
                now,
            });

            expect(decision.status).toBe('unreachable');
            expect(decision.incidents.map(i => i.title)).toEqual(['Elevated errors', 'Network upgrade', 'API latency']);
            expect(decision.upcomingMaintenance).toBeNull();
        });

        it('Incidents gravados de um Feed não lido não pesam no estado vindo de outro Feed lido', () => {
            const decision = decideProviderStatus({
                accessOnly: false,
                feeds: [{ read: false, answered: false, incidents: [problem({ title: 'Old outage' })] }, feed('operational')],
                probes: [],
                previousPollUnanswered: false,
                now,
            });
            expect(decision.status).toBe('operational');
            expect(decision.incidents.map(i => i.title)).toEqual(['Old outage']);
        });
    });
});
