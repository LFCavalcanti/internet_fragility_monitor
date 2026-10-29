// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { decideProviderStatus, type FeedReading } from '@/lib/provider-status';
import type { IncidentData, MaintenanceIncident, ProblemIncident } from '@/lib/fetchers/types';

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
    declared: 'operational' | 'degraded' | 'outage',
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
            feeds: [feed('operational', [maintenance()])],
            probes: [],
            previousPollUnanswered: false,
            now,
        });

        expect(decision.status).toBe('operational');
        expect(decision.upcomingMaintenance).toEqual({ count: 1, next: new Date('2026-10-27T02:00:00Z') });
        expect(decision.incidents).toEqual([]);
    });

    it('manutenção em andamento vira Maintenance quando o Provider declara Operational', () => {
        const ongoing = maintenance({ status: 'in_progress', title: 'Network upgrade' });
        const decision = decideProviderStatus({
            feeds: [feed('operational', [ongoing])],
            probes: [],
            previousPollUnanswered: false,
            now,
        });

        expect(decision.status).toBe('maintenance');
        expect(decision.upcomingMaintenance).toBeNull();
        expect(decision.incidents.map(i => i.title)).toEqual(['Network upgrade']);
    });

    it('manutenção em andamento nunca prevalece sobre Degraded nem Outage', () => {
        const ongoing = maintenance({ status: 'in_progress' });
        for (const declared of ['degraded', 'outage'] as const) {
            const decision = decideProviderStatus({
                feeds: [feed(declared, [ongoing])],
                probes: [],
                previousPollUnanswered: false,
                now,
            });
            expect(decision.status).toBe(declared);
        }
    });

    it('manutenção completed não aparece nem afeta o estado', () => {
        const done = maintenance({ status: 'completed', title: 'Old maintenance' });
        const decision = decideProviderStatus({
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
            feeds: [feed('operational', [problem({ status: 'resolved' })])],
            probes: [],
            previousPollUnanswered: false,
            now,
        });
        expect(decision.upcomingMaintenance).toBeNull();
    });

    it('manutenção agendada sem data marcada conta, e a próxima data vem das que têm data', () => {
        const decision = decideProviderStatus({
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

    describe('precedência Down, Outage, Degraded, Maintenance, Operational', () => {
        const ongoing = maintenance({ status: 'in_progress' });

        it('o pior estado declarado entre os Feeds lidos vence', () => {
            const decide = (...feeds: FeedReading[]) =>
                decideProviderStatus({ feeds, probes: [], previousPollUnanswered: false, now }).status;

            expect(decide(feed('operational'), feed('outage'), feed('degraded'))).toBe('outage');
            expect(decide(feed('operational'), feed('degraded'))).toBe('degraded');
            expect(decide(feed('operational'), feed('operational', [ongoing]))).toBe('maintenance');
            expect(decide(feed('degraded'), feed('operational', [ongoing]))).toBe('degraded');
            expect(decide(feed('operational'), feed('operational'))).toBe('operational');
        });

        it('Down vence tudo: nenhuma fonte respondeu neste Poll e no anterior', () => {
            const decision = decideProviderStatus({
                feeds: [{ read: false }],
                probes: [false],
                previousPollUnanswered: true,
                now,
            });
            expect(decision.status).toBe('down');
        });

        it('sem resposta só neste Poll é Unreachable, não Down', () => {
            const decision = decideProviderStatus({
                feeds: [{ read: false }],
                probes: [false],
                previousPollUnanswered: false,
                now,
            });
            expect(decision.status).toBe('unreachable');
        });

        it('nenhum Feed lido mas um Probe respondeu é Unreachable, mesmo com Poll anterior sem resposta', () => {
            const decision = decideProviderStatus({
                feeds: [{ read: false }],
                probes: [true],
                previousPollUnanswered: true,
                now,
            });
            expect(decision.status).toBe('unreachable');
        });

        it('Provider só com Probes fica Operational quando algum Probe responde', () => {
            const decision = decideProviderStatus({
                feeds: [],
                probes: [false, true],
                previousPollUnanswered: false,
                now,
            });
            expect(decision.status).toBe('operational');
        });

        it('Feed não lido ao lado de Feed lido: o estado vem do lido', () => {
            const decision = decideProviderStatus({
                feeds: [{ read: false }, feed('degraded')],
                probes: [],
                previousPollUnanswered: true,
                now,
            });
            expect(decision.status).toBe('degraded');
        });
    });

    describe('Unreachable', () => {
        it('falha de leitura do único Feed, sem Probes, é Unreachable e não Outage', () => {
            const decision = decideProviderStatus({
                feeds: [{ read: false }],
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
                feeds: [{ read: false, incidents: [active, resolved, ongoing, maintenance()] }],
                probes: [],
                previousPollUnanswered: false,
                now,
            });

            expect(decision.status).toBe('unreachable');
            expect(decision.incidents.map(i => i.title)).toEqual(['Elevated errors', 'API latency', 'Network upgrade']);
            expect(decision.upcomingMaintenance).toBeNull();
        });

        it('Incidents gravados de um Feed não lido não pesam no estado vindo de outro Feed lido', () => {
            const decision = decideProviderStatus({
                feeds: [{ read: false, incidents: [problem({ title: 'Old outage' })] }, feed('operational')],
                probes: [],
                previousPollUnanswered: false,
                now,
            });
            expect(decision.status).toBe('operational');
            expect(decision.incidents.map(i => i.title)).toEqual(['Old outage']);
        });
    });
});
