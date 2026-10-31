/**
 * O Snapshot de cada Provider e a entrada do módulo de Provider Status montada a partir dele.
 * Módulo puro, como o de Provider Status: não lê banco nem rede.
 */
import type { ReadingStatus, StatusResult } from "./status-feed/types";
import type { ProviderReading } from "./status-feed/provider-reading";
import type { ProviderStatusInput } from "./provider-status";

/** Um Provider ativo do Provider Catalog, com os dados que a página e o Internet Health usam. */
export interface SnapshotProvider {
    id: string;
    name: string;
    logo?: string;
    /** Link da status page no card. */
    statusPageUrl?: string;
    /** Marcado no catálogo como Major Provider. */
    isMajor: boolean;
}

/**
 * Um Provider ativo no Snapshot: os dados do catálogo e o resultado gravado do último Poll, com a marca de
 * "só acesso" (`result.accessOnly`) tirada das fontes ativas do Provider no catálogo.
 */
export interface SnapshotEntry {
    provider: SnapshotProvider;
    result: StatusResult;
}

/**
 * O que um Poll grava de um Provider em `status_checks`, todas com a mesma hora: uma linha por Feed, com o estado
 * declarado ou "unreachable", o que preserva a Partial Reading sem coluna nova. Provider só com Probes: uma linha
 * só, Operational quando algum Probe respondeu. Os Probes de um Provider com Feed não são gravados: até o Ticket 15
 * eles não mudam nada, porque Unreachable vale com ou sem resposta deles.
 */
export function toRecordedReadings({ accessOnly, feeds, probes }: ProviderReading): ReadingStatus[] {
    if (accessOnly) return [probes.some(Boolean) ? "operational" : "unreachable"];
    return feeds.map(f => (f.read ? f.declared : "unreachable"));
}

/**
 * Remonta a entrada do módulo de Provider Status a partir das leituras gravadas pelo último Poll.
 * Provider com Feed: cada Feed vai lido, com o estado declarado, ou não lido. Os Incidents gravados ainda não dizem
 * de qual Feed vieram (Ticket 14), então vão juntos no primeiro Feed lido, ou no primeiro Feed se nenhum foi lido:
 * o pior estado e a soma dos Incidents saem iguais.
 * Provider só com Probes: nenhum Feed, e a leitura gravada diz só se algum Probe respondeu. Um estado
 * declarado gravado antes (de quando havia Feed) não conta: só um Feed declara Degraded, Outage ou Maintenance.
 * O Poll anterior sem resposta, que habilita Down, chega com o Ticket 15.
 */
export function toProviderStatusInput(result: StatusResult, now: Date): ProviderStatusInput {
    const base = { previousPollUnanswered: false, now };
    const { readings } = result;
    if (result.accessOnly) {
        return { ...base, accessOnly: true, feeds: [], probes: readings.map(r => r !== "unreachable") };
    }

    const incidentsAt = Math.max(0, readings.findIndex(r => r !== "unreachable"));
    return {
        ...base,
        accessOnly: false,
        feeds: readings.map((reading, index) => {
            const incidents = index === incidentsAt ? result.incidents : [];
            return reading === "unreachable" ? { read: false, incidents } : { read: true, declared: reading, incidents };
        }),
        probes: [],
    };
}
