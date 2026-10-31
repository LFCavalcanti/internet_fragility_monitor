/**
 * A regra de descarte do Poll, com leituras prontas: nada de rede nem de banco.
 * O caminho até a gravação está em __tests__/lib/poll-catalog.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { monitorFailure, type ProbeReading, type ProviderReading } from '@/lib/status-feed/provider-reading';

const silentProbe: ProbeReading = { answered: false, gotHttpResponse: false };
const liveProbe: ProbeReading = { answered: true, gotHttpResponse: true };

/** Um Poll com `total` fontes, todas Probes de um Provider só, das quais `silent` não dão resposta HTTP. */
const pollOf = (total: number, silent: number): ProviderReading[] => [
    {
        providerId: 'acme',
        accessOnly: true,
        feeds: [],
        probes: Array.from({ length: total }, (_, i) => (i < silent ? silentProbe : liveProbe)),
    },
];

describe('o Poll é descartado quando mais da metade das fontes não dá resposta HTTP', () => {
    it.each([
        [38, 20, true],
        [38, 19, false],
        [38, 38, true],
        [38, 0, false],
        [4, 2, false],
        [4, 3, true],
        [1, 1, true],
    ])('%i fontes, %i sem resposta HTTP: descartado = %s', (total, silent, discarded) => {
        expect(monitorFailure(pollOf(total, silent)) !== null).toBe(discarded);
    });

    it('traz quantas fontes ficaram sem resposta e o total, para o log', () => {
        expect(monitorFailure(pollOf(38, 20))).toEqual({ withoutResponse: 20, total: 38 });
    });

    it('sem nenhuma fonte ativa, o Poll não é descartado', () => {
        expect(monitorFailure([])).toBeNull();
        expect(monitorFailure([{ providerId: 'acme', accessOnly: true, feeds: [], probes: [] }])).toBeNull();
    });

    it('Feeds e Probes contam, de todos os Providers', () => {
        const silentFeed = { sourceId: 'f', read: false, answered: false, gotHttpResponse: false } as const;
        const reading = (providerId: string): ProviderReading => ({
            providerId,
            accessOnly: false,
            feeds: [silentFeed],
            probes: [liveProbe],
        });

        expect(monitorFailure([reading('a'), reading('b')])).toBeNull();
        expect(monitorFailure([reading('a'), { ...reading('b'), probes: [silentProbe] }])).toEqual({ withoutResponse: 3, total: 4 });
    });

    it('5xx é resposta HTTP: todas as fontes sem resposta para Down, mas com resposta HTTP, não descartam', () => {
        const errorFeed = { sourceId: 'f', read: false, answered: false, gotHttpResponse: true } as const;

        expect(monitorFailure([{
            providerId: 'acme',
            accessOnly: false,
            feeds: [errorFeed, errorFeed],
            probes: [{ answered: false, gotHttpResponse: true }],
        }])).toBeNull();
    });
});
