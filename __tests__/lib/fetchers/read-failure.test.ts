// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AWSFetcher } from '@/lib/fetchers/aws';
import { AzureFetcher } from '@/lib/fetchers/azure';
import { GoogleCloudFetcher } from '@/lib/fetchers/google';
import { HerokuFetcher } from '@/lib/fetchers/heroku';
import { StatusPageFetcher } from '@/lib/fetchers/statuspage';
import { CloudflareFetcher } from '@/lib/fetchers/cloudflare';
import { GitHubFetcher } from '@/lib/fetchers/github';
import { VercelFetcher } from '@/lib/fetchers/vercel';
import { PingFetcher } from '@/lib/fetchers/ping';
import type { Fetcher } from '@/lib/fetchers/types';

// Falha de leitura descreve a leitura, não o Provider: nunca é Outage (GLOSSARY.md, Unreachable).
const fetchers: [string, () => Fetcher][] = [
    ['AWS', () => new AWSFetcher()],
    ['Azure', () => new AzureFetcher()],
    ['Google Cloud', () => new GoogleCloudFetcher()],
    ['Heroku', () => new HerokuFetcher()],
    ['Statuspage.io', () => new StatusPageFetcher('jira', 'https://jira-software.status.atlassian.com')],
    ['Cloudflare', () => new CloudflareFetcher()],
    ['GitHub', () => new GitHubFetcher()],
    ['Vercel', () => new VercelFetcher()],
    ['Probe (ping)', () => new PingFetcher('salesforce', 'https://www.salesforce.com')],
];

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('falha de leitura vira Unreachable', () => {
    it.each(fetchers)('%s: erro de rede resulta em Unreachable, sem Incidents', async (_name, make) => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

        const result = await make().fetchStatus();

        expect(result.status).toBe('unreachable');
        expect(result.incidents).toEqual([]);
    });

    it.each(fetchers.filter(([name]) => name !== 'Probe (ping)'))(
        '%s: resposta HTTP de erro resulta em Unreachable',
        async (_name, make) => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' }),
            );

            const result = await make().fetchStatus();

            expect(result.status).toBe('unreachable');
        },
    );
});
