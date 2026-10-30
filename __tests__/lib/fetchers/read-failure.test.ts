// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AWSFetcher } from '@/lib/fetchers/aws';
import { AzureFetcher } from '@/lib/fetchers/azure';
import { GoogleCloudFetcher } from '@/lib/fetchers/google';
import { HerokuFetcher } from '@/lib/fetchers/heroku';
import { StatusPageFetcher } from '@/lib/fetchers/statuspage';
import type { Fetcher } from '@/lib/fetchers/types';

// Falha de leitura descreve a leitura, não o Provider: nunca é Outage (GLOSSARY.md, Unreachable).
// A falha de Probe é coberta em __tests__/lib/poll-catalog.test.ts.
const fetchers: [string, () => Fetcher][] = [
    ['AWS', () => new AWSFetcher('aws', 'https://status.aws.amazon.com/rss/all.rss')],
    ['Azure', () => new AzureFetcher('azure', 'https://azure.status.microsoft/en-us/status/feed/')],
    ['Google Cloud', () => new GoogleCloudFetcher('google-cloud', 'https://status.cloud.google.com/incidents.json')],
    ['Heroku', () => new HerokuFetcher('heroku', 'https://status.heroku.com/api/v4/current-status')],
    ['Statuspage.io', () => new StatusPageFetcher('jira', 'https://jira-software.status.atlassian.com')],
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

    it.each(fetchers)(
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
