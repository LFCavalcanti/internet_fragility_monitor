import cron from "node-cron";
import type { Database } from "./db";
import { readActiveCatalog, readSnapshot, recordPoll } from "./poll-recording";
import { readAllProviders } from "./status-feed";
import { noSourceAnswered } from "./status-feed/provider-reading";

let isRunning = false;

export async function initCron(db: Database) {
    if (isRunning) return;
    isRunning = true;

    console.log("Initializing Cron Job...");

    // Check last update time
    try {
        const { lastPollAt } = await readSnapshot(db, new Date());

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        if (!lastPollAt || lastPollAt < fiveMinutesAgo) {
            console.log("Last update was older than 5 minutes (or never). Triggering immediate update...");
            await runPoll(db);
        } else {
            console.log(`Data is fresh (last updated ${lastPollAt.toISOString()}). Skipping immediate update.`);
        }
    } catch (error) {
        console.error("Error checking last update time:", error);

        // Fallback to running if check fails
        await runPoll(db);
    }

    // Schedule to run every 5 minutes
    cron.schedule("*/5 * * * *", () => {
        console.log("Running scheduled Poll...");
        runPoll(db);
    });
}

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
