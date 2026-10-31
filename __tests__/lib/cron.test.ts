// @vitest-environment node
/**
 * O adaptador do Poll Schedule: `node-cron` dispara a política, ligada ao banco real das migrations (SQLite em memória).
 * Só o `node-cron` e a rede são simulados. As regras da política estão em `poll-schedule.test.ts`, com tudo falso.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMigratedDb, type MigratedDb } from '../helpers/migrated-db';
import { healthyResponse } from '../helpers/status-feed';
import { cronExpressionFor } from '@/lib/cron';

const mockSchedule = vi.hoisted(() => vi.fn());
vi.mock('node-cron', () => ({ default: { schedule: mockSchedule } }));

const MINUTE = 60 * 1000;

let current: MigratedDb;

const checksCount = async () => (await current.client.execute('SELECT count(*) AS n FROM status_checks')).rows[0].n;

const pollOf = (minutesAgo: number) =>
    current.client.execute({
        sql: "INSERT INTO status_checks (provider_id, status, checked_at) VALUES ('aws', 'operational', ?)",
        args: [Math.floor(Date.now() / 1000) - minutesAgo * 60],
    });

// O agendamento do processo fica no módulo: cada teste recebe um módulo novo.
const loadCron = () => import('@/lib/cron');

/** Quantas linhas um Poll grava: uma por Provider do catálogo. */
const ACTIVE_PROVIDERS = 13;

describe('expressão do node-cron', () => {
    it('sai da cadência em minutos', () => {
        expect(cronExpressionFor(5 * MINUTE)).toBe('*/5 * * * *');
        expect(cronExpressionFor(10 * MINUTE)).toBe('*/10 * * * *');
    });

    it.each([
        ['não fecha a hora: o último intervalo sairia mais curto', 7 * MINUTE],
        ['não é um número inteiro de minutos', 90 * 1000],
        ['não cabe no campo de minutos', 60 * MINUTE],
    ])('recusa uma cadência que %s', (_, cadenceMs) => {
        expect(() => cronExpressionFor(cadenceMs)).toThrow(/cadência/i);
    });
});

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

    it('lê a hora do último Poll no banco: com o último antigo, grava um Poll na hora', async () => {
        await pollOf(10);
        const { initCron } = await loadCron();

        await initCron(current.db);

        expect(await checksCount()).toBe(1 + ACTIVE_PROVIDERS);
    });

    it('lê a hora do último Poll no banco: com o último recente, não grava nada', async () => {
        await pollOf(1);
        const { initCron } = await loadCron();

        await initCron(current.db);

        expect(await checksCount()).toBe(1);
    });

    it('com o banco vazio, grava um Poll na hora', async () => {
        const { initCron } = await loadCron();

        await initCron(current.db);

        expect(await checksCount()).toBe(ACTIVE_PROVIDERS);
    });

    it('sem conseguir ler o banco, registra no log, tenta o Poll e agenda mesmo assim', async () => {
        const { initCron } = await loadCron();
        current.client.close();

        await initCron(current.db);

        expect(console.error).toHaveBeenCalledWith('Error checking last Poll time:', expect.any(Error));
        expect(console.error).toHaveBeenCalledWith('Poll não gravado:', expect.any(Error));
        expect(mockSchedule).toHaveBeenCalledTimes(1);
    });

    it('o Poll agendado grava com o banco recebido', async () => {
        await pollOf(1);
        const { initCron } = await loadCron();
        await initCron(current.db);

        const scheduledPoll = mockSchedule.mock.calls[0][1];
        await scheduledPoll();

        expect(await checksCount()).toBe(1 + ACTIVE_PROVIDERS);
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
