/**
 * O que o módulo de Status Feed devolve por Provider num Poll: exatamente a entrada que o módulo de Provider Status
 * espera. A regra de descarte do Poll mora aqui, sem nada de rede, porque só depende dessas leituras.
 * Termos conforme GLOSSARY.md.
 */
import { sourcesUnanswered, type ProviderStatusInput, type FeedReading } from "../provider-status";
import type { IncidentData } from "./types";

/** A leitura de um Feed num Poll, com a Provider Source lida: um Feed lido e sem Incidents também diz qual Feed foi. */
export type SourcedFeedReading<I extends IncidentData = IncidentData> = FeedReading<I> & { sourceId: string };

export interface ProviderReading<I extends IncidentData = IncidentData>
    extends Pick<ProviderStatusInput, "accessOnly" | "probes"> {
    providerId: string;
    /** A leitura de cada Feed ativo do Provider, na ordem do catálogo. */
    feeds: SourcedFeedReading<I>[];
}

/**
 * Falha do próprio monitor: nenhuma fonte de nenhum Provider ativo respondeu, nem Feeds nem Probes.
 * Responder é mais do que ser lido (`feedAnswered`): um Feed com 200 fora do formato prova que a conexão funciona.
 * Sem nenhuma fonte ativa, não houve o que responder, e isso não é falha do monitor.
 */
export function noSourceAnswered(readings: readonly ProviderReading[]): boolean {
    return sourcesUnanswered(readings.flatMap(r => r.feeds), readings.flatMap(r => r.probes));
}
