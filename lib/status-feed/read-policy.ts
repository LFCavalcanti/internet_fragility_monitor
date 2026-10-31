/**
 * Política de leitura: o único lugar que busca uma Provider Source na rede. Vale para Feeds e Probes:
 * timeout, tratamento de falha e registro da duração e do resultado no log. A duração nunca entra no resultado.
 * Uma leitura nunca rejeita: a falha de uma fonte não afeta as outras, nem as do mesmo Provider.
 * Termos conforme GLOSSARY.md.
 */
import type { DeclaredStatus, IncidentData } from "../fetchers/types";
import type { FeedReading } from "../provider-status";
import type { ProviderSource } from "../schema";

/** Quanto uma leitura espera, do pedido ao fim do conteúdo, antes de contar como falha. */
export const READ_TIMEOUT_MS = 10_000;

type ReadableSource = Pick<ProviderSource, "id" | "url">;

/** Um Incident como o Feed o publica, com o id que o Feed dá a ele. A Provider Source é posta pela política. */
export type PublishedIncident = IncidentData & { externalId: string };

export interface FeedContent {
    declared: DeclaredStatus;
    incidents: PublishedIncident[];
}

/**
 * Leitor de uma família de Feed: só interpreta o conteúdo que a política já obteve, sem nada de rede.
 * `read` valida o conteúdo (schema do Zod) e lança quando ele está fora do formato: o Feed fica não lido.
 */
export interface FeedReader {
    /** Endereço a buscar a partir da URL do catálogo. Sem ele, busca a própria URL. */
    address?(catalogUrl: string): string;
    read(body: string): FeedContent;
}

/** Aplica a política a uma leitura. Devolve null quando ela falha, por qualquer motivo. */
async function attempt<T>(source: ReadableSource, read: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
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
    }
}

/** Lê um Feed: resposta fora de 2xx, timeout, erro de rede e conteúdo fora do formato resultam em Feed não lido. */
export async function readFeed(source: ReadableSource, reader: FeedReader): Promise<FeedReading> {
    const content = await attempt(source, async signal => {
        const response = await fetch(reader.address?.(source.url) ?? source.url, { cache: "no-store", signal });
        if (!response.ok) throw new Error(`resposta HTTP ${response.status}`);
        return reader.read(await response.text());
    });
    if (!content) return { read: false };

    return {
        read: true,
        declared: content.declared,
        incidents: content.incidents.map(incident => ({ ...incident, sourceId: source.id })),
    };
}

/**
 * Lê um Probe: qualquer resposta HTTP abaixo de 500 conta como de pé, inclusive 302 e 403 (o redirecionamento
 * não é seguido: a resposta do próprio endereço é a que conta). Timeout, erro de rede e 5xx contam como falha.
 */
export async function readProbe(source: ReadableSource): Promise<boolean> {
    const answered = await attempt(source, async signal => {
        const response = await fetch(source.url, { redirect: "manual", cache: "no-store", signal });
        // Só o código importa: o corpo é descartado sem ser baixado.
        await response.body?.cancel().catch(() => {});
        if (response.status >= 500) throw new Error(`resposta HTTP ${response.status}`);
        return true;
    });
    return answered ?? false;
}
