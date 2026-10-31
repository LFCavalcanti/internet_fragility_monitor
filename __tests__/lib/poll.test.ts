// @vitest-environment node
/**
 * A operação de Poll no banco real das migrations (SQLite em memória). Só a rede é simulada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMigratedDb, type MigratedDb } from '../helpers/migrated-db';
import { healthyResponse } from '../helpers/status-feed';
import { runPoll } from '@/lib/poll';

let current: MigratedDb;

const checksCount = async () => (await current.client.execute('SELECT count(*) AS n FROM status_checks')).rows[0].n;

/** Quantas linhas um Poll grava: uma por Provider do catálogo, cada um com o seu Feed ou Probes. */
const ACTIVE_PROVIDERS = 13;

describe('falha ao gravar um Poll', () => {
    beforeEach(async () => {
        current = await createMigratedDb();
        vi.stubGlobal('fetch', vi.fn(async (url: string) => healthyResponse(String(url))));
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('vai ao log, não rejeita nem deixa nada gravado, e o Poll seguinte grava', async () => {
        await current.client.execute(`CREATE TRIGGER fail_write BEFORE INSERT ON status_checks WHEN NEW.provider_id = 'heroku'
            BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`);

        await expect(runPoll(current.db)).resolves.toBeUndefined();

        expect(console.error).toHaveBeenCalledWith('Poll não gravado:', expect.any(Error));
        expect(await checksCount()).toBe(0);

        await current.client.execute('DROP TRIGGER fail_write');
        await runPoll(current.db);

        expect(await checksCount()).toBe(ACTIVE_PROVIDERS);
    });

    it('falha de leitura do catálogo também vai ao log, sem rejeitar', async () => {
        current.client.close();

        await expect(runPoll(current.db)).resolves.toBeUndefined();

        expect(console.error).toHaveBeenCalledWith('Poll não gravado:', expect.any(Error));
    });

    it('um Incident sem título deixa só aquele Feed não lido, e o Poll grava os demais Providers', async () => {
        vi.mocked(fetch).mockImplementation(async url =>
            String(url).endsWith('/api/v4/current-status')
                ? Response.json({
                      status: [{ system: 'Apps', status: 'green' }],
                      incidents: [{ id: 1, title: '   ', state: 'investigating', created_at: '2026-10-30T10:00:00Z', updated_at: '2026-10-30T10:00:00Z' }],
                      scheduled: [],
                  })
                : healthyResponse(String(url)),
        );

        await runPoll(current.db);

        expect(console.error).not.toHaveBeenCalledWith('Poll não gravado:', expect.anything());
        expect(await checksCount()).toBe(ACTIVE_PROVIDERS);
        const heroku = await current.client.execute("SELECT status FROM status_checks WHERE provider_id = 'heroku'");
        expect(heroku.rows[0].status).toBe('unreachable');
    });
});

describe('a hora do Poll', () => {
    const POLL_AT = new Date('2026-10-31T12:00:00Z');

    beforeEach(async () => {
        current = await createMigratedDb();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.useFakeTimers({ toFake: ['Date'], now: POLL_AT });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('é uma só, a do começo do Poll, para os leitores e para a gravação, mesmo com a rede demorando', async () => {
        const fetchMock = vi.fn(async (url: string) => {
            vi.setSystemTime(POLL_AT.getTime() + 5_000);
            return healthyResponse(String(url));
        });
        vi.stubGlobal('fetch', fetchMock);

        await runPoll(current.db);

        const asked = fetchMock.mock.calls.map(c => String(c[0])).find(u => u.includes('/maintenances?'));
        expect(new URL(asked ?? 'https://x.test').searchParams.get('startTime')).toBe('2026-10-28T12:00:00.000Z');
        const checks = await current.client.execute('SELECT DISTINCT checked_at FROM status_checks');
        expect(checks.rows.map(r => r.checked_at)).toEqual([POLL_AT.getTime() / 1000]);
    });
});
