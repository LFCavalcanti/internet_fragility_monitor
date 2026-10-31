/**
 * O que o módulo de Status Feed devolve por Provider num Poll. É a entrada do módulo de Provider Status mais o que só o
 * Poll usa e nunca é gravado: se cada fonte deu resposta HTTP. A regra de descarte do Poll mora aqui, sem nada de rede,
 * porque só depende dessas leituras.
 * Termos conforme GLOSSARY.md.
 */
import type { FeedReading, ProviderStatusInput } from "../provider-status";
import type { IncidentData } from "./types";

/**
 * Dar resposta HTTP é receber qualquer código, inclusive 5xx: prova que a rede do monitor funciona. Timeout, erro de DNS
 * e erro de conexão não são resposta. Não é o mesmo que responder, código abaixo de 500, que é a base de Down: isto serve
 * só para o descarte. É obrigatório: um campo esquecido não pode mudar o descarte em silêncio.
 */
export interface HttpResponseMark {
    gotHttpResponse: boolean;
}

/** A leitura de um Feed como a política de leitura a devolve. */
export type PolledFeedReading<I extends IncidentData = IncidentData> = FeedReading<I> & HttpResponseMark;

/** A leitura de um Feed num Poll, com a Provider Source lida: um Feed lido e sem Incidents também diz qual Feed foi. */
export type SourcedFeedReading<I extends IncidentData = IncidentData> = PolledFeedReading<I> & { sourceId: string };

/** A leitura de um Probe num Poll. `answered` é o que o módulo de Provider Status recebe em `probes`. */
export interface ProbeReading extends HttpResponseMark {
    answered: boolean;
}

export interface ProviderReading<I extends IncidentData = IncidentData> extends Pick<ProviderStatusInput, "accessOnly"> {
    providerId: string;
    /** A leitura de cada Feed ativo do Provider, na ordem do catálogo. */
    feeds: SourcedFeedReading<I>[];
    /** A leitura de cada Probe ativo do Provider. */
    probes: ProbeReading[];
}

/** Por que um Poll foi descartado: quantas fontes ativas ficaram sem resposta HTTP, entre todas. */
export interface MonitorFailure {
    withoutResponse: number;
    total: number;
}

/**
 * Falha do próprio monitor: mais da metade das fontes ativas do Poll não deu resposta HTTP, e o Poll é descartado. Com
 * exatamente a metade, ele é gravado. Sem nenhuma fonte ativa, não houve o que responder, e isso não é falha do monitor.
 * Devolve null quando o Poll deve ser gravado.
 */
export function monitorFailure(readings: readonly ProviderReading[]): MonitorFailure | null {
    const sources = readings.flatMap((r): HttpResponseMark[] => [...r.feeds, ...r.probes]);
    const withoutResponse = sources.filter(s => !s.gotHttpResponse).length;
    return withoutResponse > sources.length / 2 ? { withoutResponse, total: sources.length } : null;
}
