// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    decideInternetHealth,
    lastAnsweredPollAt,
    type InternetHealth,
    type ProviderHealthEntry,
} from '@/lib/internet-health';
import type { ProviderStatus } from '@/lib/provider-status';
import type { IncidentData, StatusResult } from '@/lib/status-feed/types';

const now = new Date('2026-10-26T15:00:00Z');

/** Os Major Providers marcados no Provider Catalog (migration de carga). */
const MAJOR_PROVIDERS = ['aws', 'google-cloud', 'azure', 'cloudflare'];

const NAMES: Record<string, string> = {
    aws: 'AWS',
    'google-cloud': 'Google Cloud',
    azure: 'Azure',
    cloudflare: 'Cloudflare',
    heroku: 'Heroku',
    vercel: 'Vercel',
    github: 'GitHub',
};

/** Um Provider do Snapshot com o estado decidido; a marca de Major Provider segue a carga do catálogo. */
const provider = (
    providerId: string,
    status: ProviderStatus,
    incidents: IncidentData[] = [],
    isMajor = MAJOR_PROVIDERS.includes(providerId),
): ProviderHealthEntry => ({
    provider: {
        name: NAMES[providerId] ?? providerId,
        logo: `https://logos.example/${providerId}.svg`,
        isMajor,
    },
    decision: { status, incidents },
});

/** Poll de 5 minutos atrás: Snapshot recente. */
const recentPoll = new Date('2026-10-26T14:55:00Z');

/** Internet Health de um Snapshot recente, que nunca é Stale. */
const decide = (providers: ProviderHealthEntry[]): InternetHealth => {
    const state = decideInternetHealth({ providers, lastPollAt: recentPoll, now });
    if (state.status === 'Stale') throw new Error('Snapshot recente não pode ser Stale Snapshot');
    return state;
};

describe('decideInternetHealth', () => {
    it('Healthy quando todos os Providers estão Operational, sem destaque', () => {
        const health = decide([provider('aws', 'operational'), provider('heroku', 'operational')]);

        expect(health.status).toBe('Healthy');
        expect(health.highlight).toBeUndefined();
    });

    it('Critical quando um Major Provider está em Outage, com o Provider e o Incident ativo no destaque', () => {
        const health = decide([
            provider('heroku', 'operational'),
            provider('cloudflare', 'outage', [
                {
                    kind: 'problem',
                    title: 'Old resolved issue',
                    status: 'resolved',
                    createdAt: new Date('2026-10-26T01:00:00Z'),
                },
                {
                    kind: 'problem',
                    title: 'Partial System Outage',
                    status: 'investigating',
                    createdAt: new Date('2026-10-26T14:00:00Z'),
                },
            ]),
        ]);

        expect(health.status).toBe('Critical');
        expect(health.highlight).toEqual({
            type: 'outage',
            title: 'Service Outage',
            providerName: 'Cloudflare',
            providerLogo: 'https://logos.example/cloudflare.svg',
            description: 'Partial System Outage',
        });
    });

    it('Cloudflare é Major Provider: um Outage dela sozinha já é Critical', () => {
        expect(decide([provider('cloudflare', 'outage')]).status).toBe('Critical');
    });

    it('Down de Major Provider é Critical, com o destaque próprio de Down', () => {
        const health = decide([provider('aws', 'down'), provider('heroku', 'operational')]);

        expect(health.status).toBe('Critical');
        expect(health.highlight).toEqual({
            type: 'down',
            title: 'Service Down',
            providerName: 'AWS',
            providerLogo: 'https://logos.example/aws.svg',
            description: 'Status page e serviço sem resposta',
        });
    });

    it('dois Providers pequenos em Outage ou Down são Critical, com a menção a vários Providers', () => {
        const health = decide([
            provider('heroku', 'outage'),
            provider('aws', 'degraded'),
            provider('vercel', 'down'),
        ]);

        expect(health.status).toBe('Critical');
        expect(health.highlight).toEqual({
            type: 'down',
            title: 'Widespread Outage',
            providerName: 'Multiple Providers',
            description: 'Major outages detected in Heroku, Vercel (status page e serviço sem resposta).',
        });
    });

    it('queda isolada de um Provider pequeno é Unstable, com ele no destaque', () => {
        const health = decide([
            provider('aws', 'degraded'),
            provider('heroku', 'outage', [
                { kind: 'problem', title: 'Dyno errors', status: 'identified', createdAt: now },
            ]),
        ]);

        expect(health.status).toBe('Unstable');
        expect(health.highlight).toEqual({
            type: 'outage',
            title: 'Service Outage',
            providerName: 'Heroku',
            providerLogo: 'https://logos.example/heroku.svg',
            description: 'Dyno errors',
        });
    });

    it('Down isolado de um Provider pequeno é Unstable, com o destaque de Down', () => {
        const health = decide([provider('github', 'down')]);

        expect(health.status).toBe('Unstable');
        expect(health.highlight?.type).toBe('down');
        expect(health.highlight?.description).toBe('Status page e serviço sem resposta');
    });

    it('Degraded de um Major Provider é Unstable, não Critical', () => {
        const health = decide([provider('google-cloud', 'degraded')]);

        expect(health.status).toBe('Unstable');
        expect(health.highlight).toEqual({
            type: 'degraded',
            title: 'Service Degraded',
            providerName: 'Google Cloud',
            providerLogo: 'https://logos.example/google-cloud.svg',
            description: 'Service issues reported.',
        });
    });

    it('vários Providers em Degraded são Unstable, com a menção a vários Providers', () => {
        const health = decide([
            provider('aws', 'degraded'),
            provider('github', 'degraded'),
            provider('heroku', 'operational'),
        ]);

        expect(health.status).toBe('Unstable');
        expect(health.highlight).toEqual({
            type: 'degraded',
            title: 'Widespread Instability',
            providerName: 'Multiple Providers',
            description: 'Degraded service detected in AWS, GitHub.',
        });
    });

    it('Maintenance e Unreachable não contam, nem em Major Providers', () => {
        const health = decide([
            provider('aws', 'maintenance'),
            provider('cloudflare', 'unreachable'),
            provider('azure', 'unreachable'),
            provider('heroku', 'maintenance'),
        ]);

        expect(health.status).toBe('Healthy');
        expect(health.highlight).toBeUndefined();
    });

    it('Unreachable não soma com uma queda isolada para chegar a Critical', () => {
        const health = decide([provider('heroku', 'outage'), provider('vercel', 'unreachable')]);

        expect(health.status).toBe('Unstable');
        expect(health.highlight?.providerName).toBe('Heroku');
    });

    it('a marca de Major Provider do item decide, não o id', () => {
        expect(decide([provider('heroku', 'outage', [], true)]).status).toBe('Critical');
        expect(decide([provider('aws', 'outage', [], false)]).status).toBe('Unstable');
    });
});

describe('decideInternetHealth: Stale Snapshot', () => {
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);
    const critical = [provider('aws', 'outage'), provider('heroku', 'outage')];

    it('Snapshot de 14 minutos mantém o Internet Health', () => {
        const health = decideInternetHealth({
            providers: critical,
            lastPollAt: minutesAgo(14),
            now,
        });

        expect(health.status).toBe('Critical');
    });

    it('Snapshot de exatamente 15 minutos ainda não é Stale Snapshot (são mais de três ciclos)', () => {
        const health = decideInternetHealth({
            providers: [provider('heroku', 'operational')],
            lastPollAt: minutesAgo(15),
            now,
        });

        expect(health.status).toBe('Healthy');
    });

    it('Snapshot de 16 minutos vira o estado neutro, inclusive sobre Critical, com a hora do último Poll e sem destaque', () => {
        const health = decideInternetHealth({
            providers: critical,
            lastPollAt: minutesAgo(16),
            now,
        });

        expect(health).toEqual({ status: 'Stale', lastPollAt: new Date('2026-10-26T14:44:00Z') });
    });

    it('sem nenhum Poll registrado também é o estado neutro, sem hora', () => {
        const health = decideInternetHealth({
            providers: [],
            lastPollAt: null,
            now,
        });

        expect(health).toEqual({ status: 'Stale', lastPollAt: null });
    });
});

describe('lastAnsweredPollAt: hora do último Poll a partir do Snapshot', () => {
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);
    const reading = (
        status: StatusResult['readings'][number],
        lastUpdated?: Date,
    ): Pick<StatusResult, 'readings' | 'lastUpdated'> => ({ readings: [status], lastUpdated });

    it('é a leitura respondida mais recente', () => {
        expect(lastAnsweredPollAt([reading('operational', minutesAgo(9)), reading('outage', minutesAgo(4))])).toEqual(
            minutesAgo(4),
        );
    });

    it('leituras unreachable não contam: Poll em que nenhum Provider responde é falha do monitor', () => {
        expect(
            lastAnsweredPollAt([reading('unreachable', minutesAgo(1)), reading('operational', minutesAgo(16))]),
        ).toEqual(minutesAgo(16));
    });

    it('todos Unreachable desde o último Poll respondido, há 16 minutos: Stale Snapshot', () => {
        const lastPollAt = lastAnsweredPollAt([
            reading('unreachable', minutesAgo(1)),
            reading('unreachable', minutesAgo(1)),
            reading('degraded', minutesAgo(16)),
        ]);
        const health = decideInternetHealth({
            providers: [provider('aws', 'outage')],
            lastPollAt,
            now,
        });

        expect(health).toEqual({ status: 'Stale', lastPollAt: minutesAgo(16) });
    });

    it('todos os Providers Unreachable: nenhum Poll respondido, Stale Snapshot', () => {
        const lastPollAt = lastAnsweredPollAt([
            reading('unreachable', minutesAgo(1)),
            reading('unreachable', minutesAgo(1)),
        ]);

        expect(lastPollAt).toBeNull();
        expect(decideInternetHealth({ providers: [], lastPollAt, now }).status).toBe(
            'Stale',
        );
    });
});
