/**
 * Apoio aos testes de leitura de Feeds e Probes: fixtures de payloads reais gravados e respostas de rede simuladas.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideProviderStatus, readIncidentsOf } from '@/lib/provider-status';
import type { SnapshotEntry } from '@/lib/poll-recording';
import type { ProbeReading, ProviderReading } from '@/lib/status-feed/provider-reading';
import type { IncidentData } from '@/lib/status-feed/types';

/** A leitura de um Provider com o que os testes conferem: o estado que o módulo decide e os Incidents dos Feeds lidos. */
export function outcomeOf<I extends IncidentData>(reading: ProviderReading<I>) {
    const probes = reading.probes.map(p => p.answered);
    return {
        ...reading,
        status: decideProviderStatus({ ...reading, probes, previousPollUnanswered: false, now: new Date() }).status,
        incidents: readIncidentsOf(reading.feeds),
    };
}

/** Leituras de Probe prontas, por quem respondeu: sem código de erro no meio, responder e dar resposta HTTP coincidem. */
export const probeReadings = (...answered: boolean[]): ProbeReading[] =>
    answered.map(a => ({ answered: a, gotHttpResponse: a }));

/** Tudo o que a leitura do Snapshot trouxe de Incidents de um Provider, antes do corte da lista do card. */
export const snapshotIncidentsOf = (entry: SnapshotEntry) => entry.reading.feeds.flatMap(f => f.incidents ?? []);

/** Payload real gravado de uma família (`__tests__/fixtures/status-feed/<família>/<arquivo>`). */
export const feedFixture = (family: string, name: string): string =>
    readFileSync(join(__dirname, '../fixtures/status-feed', family, name), 'utf8');

/** Rede que não responde: só termina quando a política de leitura aborta a requisição. */
export const hang = (_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });

/** `summary.json` da Cloudflare com tudo funcionando: o leitor dela exige o grupo de serviços e os sete Core Services. */
const HEALTHY_CLOUDFLARE_SUMMARY = {
    status: { indicator: 'none' },
    components: [
        { id: 'services', name: 'Cloudflare Sites and Services', status: 'operational', group: true, group_id: null },
        ...['CDN/Cache', 'Firewall', 'Bot Management', 'Authoritative DNS', 'Recursive DNS', 'Network', 'Workers'].map(name => ({
            id: name,
            name,
            status: 'operational',
            group: false,
            group_id: 'services',
        })),
    ],
    incidents: [],
    scheduled_maintenances: [],
};

/** Resposta de cada Feed real do catálogo com tudo funcionando; qualquer outra URL é um Probe que responde 200. */
export function healthyResponse(url: string): Response {
    if (url === 'https://www.cloudflarestatus.com/api/v2/summary.json') return Response.json(HEALTHY_CLOUDFLARE_SUMMARY);
    if (url.endsWith('/api/v2/summary.json')) {
        return Response.json({ status: { indicator: 'none' }, incidents: [], scheduled_maintenances: [] });
    }
    if (url.endsWith('incidents.json')) return Response.json([]);
    if (url.includes('/api/v4/current-status')) {
        return Response.json({ status: [{ system: 'Apps', status: 'green' }], incidents: [], scheduled: [] });
    }
    if (url.startsWith('https://api.status.salesforce.com/v1/')) return Response.json([]);
    if (url.endsWith('.rss') || url.endsWith('/feed/')) {
        return new Response('<?xml version="1.0"?><rss version="2.0"><channel><title>Status</title></channel></rss>');
    }
    return new Response('ok', { status: 200 });
}
