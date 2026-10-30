/**
 * Monta a entrada do módulo de Provider Status a partir do Snapshot gravado de um Provider.
 * Módulo puro, como o de Provider Status: não lê banco nem rede.
 */
import type { StatusResult } from "./fetchers/types";
import type { ProviderStatusInput } from "./provider-status";

export interface SnapshotReading {
    /** Se o Provider tem Feed ativo no Provider Catalog; sem Feed, ele é lido só por Probes. */
    hasFeed: boolean;
    result: StatusResult;
}

/**
 * Provider com Feed: o Feed vai lido, com o estado declarado, ou não lido, com os Incidents já gravados.
 * Provider só com Probes: nenhum Feed, e a leitura gravada diz só se algum Probe respondeu. Um estado
 * declarado gravado antes (de quando havia Feed) não conta: só um Feed declara Degraded, Outage ou Maintenance.
 * O Poll anterior sem resposta, que habilita Down, chega com o Ticket 15.
 */
export function toProviderStatusInput({ hasFeed, result }: SnapshotReading, now: Date): ProviderStatusInput {
    if (!hasFeed) {
        return { feeds: [], probes: [result.status !== "unreachable"], previousPollUnanswered: false, now };
    }
    return {
        feeds: [
            result.status === "unreachable"
                ? { read: false, incidents: result.incidents }
                : { read: true, declared: result.status, incidents: result.incidents },
        ],
        probes: [],
        previousPollUnanswered: false,
        now,
    };
}
