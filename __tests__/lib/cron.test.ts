// @vitest-environment node
/**
 * Agendamento do Poll no banco real das migrations (SQLite em memória).
 * Só o relógio do agendador (`node-cron`) e a rede são simulados.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMigratedDb, type MigratedDb } from '../helpers/migrated-db';
import { healthyResponse } from '../helpers/status-feed';

const mockSchedule = vi.hoisted(() => vi.fn());
vi.mock('node-cron', () => ({ default: { schedule: mockSchedule } }));

let current: MigratedDb;

const checksCount = async () => (await current.client.execute('SELECT count(*) AS n FROM status_checks')).rows[0].n;

const pollOf = (minutesAgo: number) =>
    current.client.execute({
        sql: "INSERT INTO status_checks (provider_id, status, checked_at) VALUES ('aws', 'operational', ?)",
        args: [Math.floor(Date.now() / 1000) - minutesAgo * 60],
    });

// O guarda de "uma vez só" fica no módulo: cada teste recebe um módulo novo.
const loadCron = () => import('@/lib/cron');

/** Quantas linhas um Poll grava: uma por Provider do catálogo, cada um com o seu Feed ou Probes. */
const ACTIVE_PROVIDERS = 13;

describe('agendamento do Poll', () => {
    beforeEach(async () => {
        vi.resetModules();
        mockSchedule.mockReset();
        current = await createMigratedDb();
        vi.stubGlobal('fetch', vi.fn(async (url: string) => healthyResponse(String(url))));
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('agenda um Poll a cada 5 minutos', async () => {
        const { initCron } = await loadCron();

        await initCron(current.db);

        expect(mockSchedule).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function));
    });

    it('inicializa uma vez só', async () => {
        const { initCron } = await loadCron();

        await initCron(current.db);
        await initCron(current.db);

        expect(mockSchedule).toHaveBeenCalledTimes(1);
    });

    it('roda um Poll na hora quando o último tem mais de 5 minutos', async () => {
        await pollOf(10);
        const { initCron } = await loadCron();

        await initCron(current.db);

        expect(await checksCount()).toBe(1 + ACTIVE_PROVIDERS);
    });

    it('não roda um Poll na hora quando o último é recente', async () => {
        await pollOf(1);
        const { initCron } = await loadCron();

        await initCron(current.db);

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Data is fresh'));
        expect(await checksCount()).toBe(1);
    });

    it('roda um Poll na hora quando nenhum foi gravado', async () => {
        const { initCron } = await loadCron();

        await initCron(current.db);

        expect(await checksCount()).toBe(ACTIVE_PROVIDERS);
    });

    it('sem conseguir ler o banco, registra no log, tenta o Poll e agenda mesmo assim', async () => {
        const { initCron } = await loadCron();
        current.client.close();

        await initCron(current.db);

        expect(console.error).toHaveBeenCalledWith('Error checking last update time:', expect.any(Error));
        expect(console.error).toHaveBeenCalledWith('Poll não gravado:', expect.any(Error));
        expect(mockSchedule).toHaveBeenCalledTimes(1);
    });

    it('o Poll agendado grava com o banco recebido', async () => {
        await pollOf(1);
        const { initCron } = await loadCron();
        await initCron(current.db);

        const scheduledPoll = mockSchedule.mock.calls[0][1];
        await scheduledPoll();
        await vi.waitFor(async () => expect(await checksCount()).toBe(1 + ACTIVE_PROVIDERS));
    });
});

describe('falha ao gravar um Poll', () => {
    beforeEach(async () => {
        vi.resetModules();
        mockSchedule.mockReset();
        current = await createMigratedDb();
        vi.stubGlobal('fetch', vi.fn(async (url: string) => healthyResponse(String(url))));
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('vai ao log, não derruba o agendador nem deixa nada gravado, e o Poll seguinte grava', async () => {
        await current.client.execute(`CREATE TRIGGER fail_write BEFORE INSERT ON status_checks WHEN NEW.provider_id = 'heroku'
            BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`);
        const { runPoll } = await loadCron();

        await expect(runPoll(current.db)).resolves.toBeUndefined();

        expect(console.error).toHaveBeenCalledWith('Poll não gravado:', expect.any(Error));
        expect(await checksCount()).toBe(0);

        await current.client.execute('DROP TRIGGER fail_write');
        await runPoll(current.db);

        expect(await checksCount()).toBe(ACTIVE_PROVIDERS);
    });

    it('falha de leitura do catálogo também vai ao log, sem rejeitar', async () => {
        const { runPoll } = await loadCron();
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
        const { runPoll } = await loadCron();

        await runPoll(current.db);

        expect(console.error).not.toHaveBeenCalledWith('Poll não gravado:', expect.anything());
        expect(await checksCount()).toBe(ACTIVE_PROVIDERS);
        const heroku = await current.client.execute("SELECT status FROM status_checks WHERE provider_id = 'heroku'");
        expect(heroku.rows[0].status).toBe('unreachable');
    });
});

describe('Poll descartado', () => {
    beforeEach(async () => {
        vi.resetModules();
        mockSchedule.mockReset();
        current = await createMigratedDb();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('no primeiro Poll da inicialização, sem nenhuma resposta, nada é gravado e o agendador sobe', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
        const { initCron } = await loadCron();

        await initCron(current.db);

        expect(await checksCount()).toBe(0);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Poll descartado'));
        expect(mockSchedule).toHaveBeenCalledTimes(1);
    });
});
