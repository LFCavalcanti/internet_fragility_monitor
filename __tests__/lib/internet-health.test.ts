// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    decideInternetHealth,
    MAJOR_PROVIDERS,
    type ProviderHealthEntry,
} from '@/lib/internet-health';
import type { ProviderStatus } from '@/lib/provider-status';
import type { IncidentData } from '@/lib/fetchers/types';

const now = new Date('2026-10-26T15:00:00Z');

const NAMES: Record<string, string> = {
    aws: 'AWS',
    'google-cloud': 'Google Cloud',
    azure: 'Azure',
    cloudflare: 'Cloudflare',
    heroku: 'Heroku',
    vercel: 'Vercel',
    github: 'GitHub',
};

const provider = (
    providerId: string,
    status: ProviderStatus,
    incidents: IncidentData[] = [],
): ProviderHealthEntry => ({
    providerId,
    name: NAMES[providerId] ?? providerId,
    logo: `https://logos.example/${providerId}.svg`,
    status,
    incidents,
});

const decide = (providers: ProviderHealthEntry[]) =>
    decideInternetHealth({ providers, majorProviders: MAJOR_PROVIDERS, now });

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
        expect(MAJOR_PROVIDERS).toEqual(['aws', 'google-cloud', 'azure', 'cloudflare']);
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

    it('a lista de Major Providers recebida decide, não a constante', () => {
        const health = decideInternetHealth({
            providers: [provider('heroku', 'outage')],
            majorProviders: ['heroku'],
            now,
        });

        expect(health.status).toBe('Critical');
    });
});
