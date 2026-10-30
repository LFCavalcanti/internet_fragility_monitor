import type { StatusResult } from "./types";

/** Quanto um Probe espera por uma resposta antes de contar como falha. */
export const PROBE_TIMEOUT_MS = 5000;

/**
 * Um Probe só verifica se o endereço responde. Qualquer resposta HTTP abaixo de 500 conta como de pé,
 * inclusive 302 e 403 (o redirecionamento não é seguido: a resposta do próprio endereço é a que conta).
 * Timeout, erro de rede e 5xx contam como falha.
 */
async function probeAnswers(url: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: "GET",
            redirect: "manual",
            cache: "no-store",
            signal: controller.signal,
        });
        // Só o código importa: o corpo é descartado sem ser baixado.
        await response.body?.cancel().catch(() => {});
        return response.status < 500;
    } catch (error) {
        console.error(`Probe sem resposta em ${url}:`, error);
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Leitura dos Probes de um Provider: de pé quando algum Probe responde, Unreachable quando nenhum responde.
 * Probes não declaram estado nem Incidents. A marca de "só acesso" é do Poll, que conhece as fontes do Provider.
 */
export async function readProbes(providerId: string, urls: string[]): Promise<StatusResult> {
    const start = Date.now();
    const answers = await Promise.all(urls.map(probeAnswers));
    const answered = answers.some(Boolean);

    return {
        providerId,
        status: answered ? "operational" : "unreachable",
        incidents: [],
        responseTime: answered ? Date.now() - start : 0,
    };
}
