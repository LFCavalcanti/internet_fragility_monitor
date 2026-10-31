/**
 * Apoio aos testes de leitura de Feeds e Probes: fixtures de payloads reais gravados e respostas de rede simuladas.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Payload real gravado de uma família (`__tests__/fixtures/status-feed/<família>/<arquivo>`). */
export const feedFixture = (family: string, name: string): string =>
    readFileSync(join(__dirname, '../fixtures/status-feed', family, name), 'utf8');

/** Rede que não responde: só termina quando a política de leitura aborta a requisição. */
export const hang = (_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });

/** Resposta de cada Feed real do catálogo com tudo funcionando; qualquer outra URL é um Probe que responde 200. */
export function healthyResponse(url: string): Response {
    if (url.endsWith('/api/v2/summary.json')) {
        return Response.json({ status: { indicator: 'none' }, incidents: [], scheduled_maintenances: [] });
    }
    if (url.endsWith('incidents.json')) return Response.json([]);
    if (url.includes('/api/v4/current-status')) {
        return Response.json({ status: [{ system: 'Apps', status: 'green' }], incidents: [], scheduled: [] });
    }
    if (url.endsWith('.rss') || url.endsWith('/feed/')) {
        return new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>Status</title></channel></rss>');
    }
    return new Response('ok', { status: 200 });
}
