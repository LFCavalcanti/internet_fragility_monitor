// @vitest-environment node
/**
 * Conexão da aplicação: uma só, aberta no primeiro uso, nunca no import, e sem a URL no log.
 * O cliente anota a URL pedida e abre um banco em memória, para o teste não criar arquivo nem ir à rede.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const openedUrls = vi.hoisted(() => [] as string[]);

vi.mock('@libsql/client', async importOriginal => {
    const real = await importOriginal<typeof import('@libsql/client')>();
    return {
        ...real,
        createClient: ({ url }: { url: string }) => {
            openedUrls.push(url);
            return real.createClient({ url: ':memory:' });
        },
    };
});

describe('getDb', () => {
    beforeEach(() => {
        vi.resetModules();
        openedUrls.length = 0;
        vi.stubGlobal('ifmDatabase', undefined);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('importar o módulo não conecta', async () => {
        vi.stubEnv('DATABASE_URL', 'file:qualquer.db');

        await import('@/lib/db');

        expect(openedUrls).toEqual([]);
    });

    it('sem DATABASE_URL em produção, o erro vem no primeiro uso, não no import', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('DATABASE_URL', '');

        const { getDb } = await import('@/lib/db');

        expect(getDb).toThrow('DATABASE_URL is not set');
    });

    it('avisa quando DATABASE_URL falta fora de produção e usa o banco padrão', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('DATABASE_URL', '');

        const { getDb } = await import('@/lib/db');
        getDb();

        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('DATABASE_URL is not set'));
        expect(openedUrls).toEqual(['file:sqlite.db']);
    });

    it('devolve sempre a mesma conexão, mesmo com outra cópia do módulo, como a da instrumentação', async () => {
        vi.stubEnv('DATABASE_URL', 'file:qualquer.db');

        const first = (await import('@/lib/db')).getDb();
        vi.resetModules();
        const second = (await import('@/lib/db')).getDb();

        expect(second).toBe(first);
        expect(first).toHaveProperty('select');
        expect(openedUrls).toHaveLength(1);
    });

    it('não imprime a URL do banco no log', async () => {
        const url = 'libsql://user:segredo@banco.example.test';
        vi.stubEnv('DATABASE_URL', url);

        const { getDb } = await import('@/lib/db');
        getDb();

        expect(openedUrls).toEqual([url]);
        const logged = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.warn).mock.calls].flat().join(' ');
        expect(logged).not.toContain('segredo');
    });
});
