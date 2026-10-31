// @vitest-environment node
/**
 * Política de leitura de uma Provider Source, com a rede simulada.
 * A leitura de um Poll inteiro, com fontes independentes, está em __tests__/lib/poll-catalog.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { READ_TIMEOUT_MS, readFeed, readProbe, type FeedReader } from '@/lib/status-feed/read-policy';
import { hang } from '../../helpers/status-feed';

const FEED = { id: 'acme-feed', url: 'https://status.acme.test/feed' };
const PROBE = { id: 'acme-login', url: 'https://login.acme.test' };

const reader: FeedReader = {
    read: body => ({
        declared: 'degraded',
        incidents: [{ kind: 'problem', status: 'investigating', title: body, createdAt: new Date(0), externalId: 'x1' }],
    }),
};

/** Resposta cujo cabeçalho chega, mas o corpo trava até a requisição ser abortada. */
const hangBody = async (_url: unknown, init?: RequestInit) =>
    new Response(
        new ReadableStream({
            start(controller) {
                init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
            },
        }),
    );

const stubNetwork = (handler: (url: unknown, init?: RequestInit) => Promise<Response>) => {
    const fetchMock = vi.fn(handler);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('o tempo de uma leitura é de 10 segundos por Provider Source', () => {
    it('é a constante da spec', () => {
        expect(READ_TIMEOUT_MS).toBe(10_000);
    });

    it.each([
        ['sem resposta', hang],
        ['com o corpo travado', hangBody],
    ])('um Feed %s fica não lido ao fim do tempo, nem um instante antes', async (_case, network) => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        stubNetwork(network);
        let reading: unknown;

        const pending = readFeed(FEED, reader).then(r => (reading = r));

        await vi.advanceTimersByTimeAsync(9_999);
        expect(reading).toBeUndefined();

        await vi.advanceTimersByTimeAsync(1);
        await pending;
        expect(reading).toEqual({ read: false });
    });

    it('um Probe sem resposta conta como falha ao fim do mesmo tempo', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        stubNetwork(hang);
        let answered: unknown;

        const pending = readProbe(PROBE).then(r => (answered = r));

        await vi.advanceTimersByTimeAsync(9_999);
        expect(answered).toBeUndefined();

        await vi.advanceTimersByTimeAsync(1);
        await pending;
        expect(answered).toBe(false);
    });
});

describe('leitura de um Feed', () => {
    it('resposta 200: estado declarado e Incidents com a Provider Source de origem', async () => {
        stubNetwork(async () => new Response('conteúdo'));

        expect(await readFeed(FEED, reader)).toEqual({
            read: true,
            declared: 'degraded',
            incidents: [expect.objectContaining({ title: 'conteúdo', sourceId: 'acme-feed', externalId: 'x1' })],
        });
    });

    it.each([500, 503, 404, 403])('resposta %i: Feed não lido', async code => {
        stubNetwork(async () => new Response('erro', { status: code }));

        expect(await readFeed(FEED, reader)).toEqual({ read: false });
    });

    it('erro de rede: Feed não lido', async () => {
        stubNetwork(async () => {
            throw new TypeError('fetch failed');
        });

        expect(await readFeed(FEED, reader)).toEqual({ read: false });
    });

    it('um leitor que rejeita o conteúdo resulta em Feed não lido', async () => {
        stubNetwork(async () => new Response('qualquer'));
        const refuses: FeedReader = {
            read: () => {
                throw new Error('fora do formato');
            },
        };

        expect(await readFeed(FEED, refuses)).toEqual({ read: false });
    });

    it('o leitor recebe o endereço de onde o conteúdo veio', async () => {
        stubNetwork(async () => new Response('x'));
        const read = vi.fn(reader.read);

        await readFeed(FEED, { address: url => `${url}/v2`, read });

        expect(read).toHaveBeenCalledWith('x', `${FEED.url}/v2`);
    });

    it('um texto maior do que a gravação aceita chega cortado, em vez de derrubar o Poll', async () => {
        stubNetwork(async () => new Response('x'));
        const long: FeedReader = {
            read: () => ({
                declared: 'degraded',
                incidents: [
                    {
                        kind: 'problem',
                        status: 'investigating',
                        title: 'a'.repeat(501),
                        description: 'b'.repeat(5001),
                        createdAt: new Date(0),
                        externalId: 'x1',
                    },
                ],
            }),
        };

        const reading = await readFeed(FEED, long);

        if (!reading.read) throw new Error('Feed não lido');
        expect(reading.incidents[0].title).toHaveLength(500);
        expect(reading.incidents[0].description).toHaveLength(5000);
    });

    it('sem endereço próprio no leitor, busca a URL do catálogo', async () => {
        const fetchMock = stubNetwork(async () => new Response('x'));

        await readFeed(FEED, reader);

        expect(fetchMock.mock.calls[0][0]).toBe(FEED.url);
    });
});

describe('leitura de um Probe', () => {
    it.each([200, 302, 403, 404, 499])('resposta %i conta como de pé', async code => {
        stubNetwork(async () => new Response(null, { status: code }));

        expect(await readProbe(PROBE)).toBe(true);
    });

    it.each([500, 503])('resposta %i conta como falha', async code => {
        stubNetwork(async () => new Response(null, { status: code }));

        expect(await readProbe(PROBE)).toBe(false);
    });

    it('o redirecionamento não é seguido: vale a resposta do próprio endereço', async () => {
        const fetchMock = stubNetwork(async () => new Response(null, { status: 302 }));

        await readProbe(PROBE);

        expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    });
});

describe('a duração e o resultado de cada leitura vão para o log', () => {
    it('uma leitura bem-sucedida registra a fonte, o resultado e a duração', async () => {
        stubNetwork(async () => new Response('x'));

        await readFeed(FEED, reader);

        expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/acme-feed.*lida.*\d+ ms/));
    });

    it('uma leitura que falha registra a fonte, a duração e o erro', async () => {
        const failure = new TypeError('fetch failed');
        stubNetwork(async () => {
            throw failure;
        });

        await readProbe(PROBE);

        expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/acme-login.*falhou.*\d+ ms/), failure);
    });

    it('um timeout registra o motivo', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        stubNetwork(hang);

        const pending = readFeed(FEED, reader);
        await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
        await pending;

        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('acme-feed'),
            expect.objectContaining({ message: expect.stringContaining('timeout') }),
        );
    });

    it('a duração não faz parte do resultado', async () => {
        stubNetwork(async () => new Response('x'));

        const reading = await readFeed(FEED, reader);

        expect(Object.keys(reading).sort()).toEqual(['declared', 'incidents', 'read']);
    });
});
