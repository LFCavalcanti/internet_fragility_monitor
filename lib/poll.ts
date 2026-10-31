import type { Database } from "./db";
import { readActiveCatalog, recordPoll } from "./poll-recording";
import { readAllProviders } from "./status-feed";
import { monitorFailure } from "./status-feed/provider-reading";

/**
 * Um Poll: lê todas as fontes e grava, a não ser que mais da metade não tenha dado resposta HTTP, que é falha do próprio
 * monitor. A hora do Poll é uma só, a do começo dele, para os leitores e para a gravação.
 * Nunca rejeita: uma falha de leitura ou de gravação vai ao log, não grava nada e o agendador segue para o próximo Poll.
 */
export async function runPoll(db: Database) {
    try {
        const pollAt = new Date();
        const readings = await readAllProviders(await readActiveCatalog(db), pollAt);
        const failure = monitorFailure(readings);
        if (failure) {
            console.error(`Poll descartado: ${failure.withoutResponse} de ${failure.total} fontes ficaram sem resposta HTTP (falha do próprio monitor). Nada foi gravado.`);
            return;
        }
        await recordPoll(db, readings, pollAt);
        console.log(`Updated status for ${readings.length} providers.`);
    } catch (error) {
        console.error("Poll não gravado:", error);
    }
}
