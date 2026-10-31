import type { Database } from "./db";
import { readActiveCatalog, recordPoll } from "./poll-recording";
import { readAllProviders } from "./status-feed";
import { noSourceAnswered } from "./status-feed/provider-reading";

/**
 * Um Poll: lê todas as fontes e grava, a não ser que nenhuma tenha respondido, que é falha do próprio monitor.
 * Nunca rejeita: uma falha de leitura ou de gravação vai ao log, não grava nada e o agendador segue para o próximo Poll.
 */
export async function runPoll(db: Database) {
    try {
        const readings = await readAllProviders(await readActiveCatalog(db));
        if (noSourceAnswered(readings)) {
            console.error("Poll descartado: nenhuma fonte de nenhum Provider respondeu (falha do próprio monitor). Nada foi gravado.");
            return;
        }
        await recordPoll(db, readings);
        console.log(`Updated status for ${readings.length} providers.`);
    } catch (error) {
        console.error("Poll não gravado:", error);
    }
}
