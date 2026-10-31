/**
 * Política de leitura: o único lugar que busca uma Provider Source na rede. Vale para Feeds e Probes:
 * timeout, tratamento de falha e registro da duração e do resultado no log. A duração nunca entra no resultado.
 * Os textos de um Incident lido respeitam os limites de gravação (`INCIDENT_TITLE_MAX` e `INCIDENT_DESCRIPTION_MAX`).
 * Uma leitura nunca rejeita: a falha de uma fonte não afeta as outras, nem as do mesmo Provider.
 * Termos conforme GLOSSARY.md.
 */
import type { FeedReading } from "../provider-status";
import type { ProviderSource } from "../schema";
import { INCIDENT_DESCRIPTION_MAX, INCIDENT_TITLE_MAX } from "../incident-status";
import type { DeclaredStatus, PublishedIncident, ReadIncident } from "./types";

/** Quanto uma leitura espera, do pedido ao fim do conteúdo, antes de contar como falha. */
export const READ_TIMEOUT_MS = 10_000;

type ReadableSource = Pick<ProviderSource, "id" | "url">;

export interface FeedContent {
    declared: DeclaredStatus;
    incidents: PublishedIncident[];
}

/**
 * Leitor de uma família de Feed: só interpreta o conteúdo que a política já obteve, sem nada de rede.
 * `read` valida o conteúdo (schema do Zod) e lança quando ele está fora do formato: o Feed fica não lido.
 * Recebe um corpo por endereço, na mesma ordem. O endereço serve para resolver os links relativos que o Feed publica.
 */
export interface FeedReader {
    /**
     * Endereços a buscar a partir da URL do catálogo. Sem ele, busca a própria URL. Um Feed em mais de um endereço
     * é uma fonte só: um timeout para todos, e o Feed só conta como lido com todos.
     */
    addresses?(catalogUrl: string): string[];
    read(bodies: string[], addresses: string[]): FeedContent;
}

/** Executa uma leitura dentro do timeout, registrando duração e resultado. Devolve null quando ela falha. */
async function applyReadPolicy<T>(source: ReadableSource, read: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(new Error(`timeout de ${READ_TIMEOUT_MS} ms`)),
        READ_TIMEOUT_MS,
    );
    try {
        const value = await read(controller.signal);
        console.log(`Fonte ${source.id} lida em ${Date.now() - start} ms`);
        return value;
    } catch (error) {
        console.error(`Fonte ${source.id} falhou em ${Date.now() - start} ms:`, error);
        return null;
    } finally {
        clearTimeout(timeout);
        // Cancela o que ainda corre quando um dos endereços de um Feed falha antes dos outros.
        controller.abort();
    }
}

/** Limita os textos ao que a gravação aceita: um relatório longo do Provider não pode derrubar o Poll. */
function withinRecordLimits(incident: PublishedIncident): PublishedIncident {
    return {
        ...incident,
        title: incident.title.slice(0, INCIDENT_TITLE_MAX),
        description: incident.description?.slice(0, INCIDENT_DESCRIPTION_MAX),
    };
}

/** O que conta como resposta de uma fonte, Feed ou Probe: qualquer código HTTP abaixo de 500. */
const isAnswer = (response: Response) => response.status < 500;

/**
 * Lê um Feed: resposta fora de 2xx, timeout, erro de rede e conteúdo fora do formato resultam em Feed não lido.
 * Ler é mais do que responder: um Feed com 200 fora do formato ou com 404 fica não lido, mas a fonte respondeu
 * (`answered`), pela mesma regra dos Probes. Num Feed em mais de um endereço, basta um responder.
 */
export async function readFeed(source: ReadableSource, reader: FeedReader): Promise<FeedReading<ReadIncident>> {
    const addresses = reader.addresses?.(source.url) ?? [source.url];
    let answered = false;

    const fetchBody = async (address: string, signal: AbortSignal): Promise<string> => {
        const response = await fetch(address, { cache: "no-store", signal });
        answered ||= isAnswer(response);
        if (!response.ok) throw new Error(`resposta HTTP ${response.status} em ${address}`);
        return response.text();
    };

    const content = await applyReadPolicy(source, async signal => {
        const bodies = await Promise.all(addresses.map(address => fetchBody(address, signal)));
        return reader.read(bodies, addresses);
    });
    if (!content) return { read: false, answered };

    return {
        read: true,
        declared: content.declared,
        incidents: content.incidents.map(incident => ({ ...withinRecordLimits(incident), sourceId: source.id })),
    };
}

/**
 * Lê um Probe: qualquer resposta HTTP abaixo de 500 conta como de pé, inclusive 302 e 403 (o redirecionamento
 * não é seguido: a resposta do próprio endereço é a que conta). Timeout, erro de rede e 5xx contam como falha.
 */
export async function readProbe(source: ReadableSource): Promise<boolean> {
    const answered = await applyReadPolicy(source, async signal => {
        const response = await fetch(source.url, { redirect: "manual", cache: "no-store", signal });
        // Só o código importa: o corpo é descartado sem ser baixado.
        await response.body?.cancel().catch(() => {});
        if (!isAnswer(response)) throw new Error(`resposta HTTP ${response.status}`);
        return true;
    });
    return answered ?? false;
}
