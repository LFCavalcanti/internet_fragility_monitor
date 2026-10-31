import cron from "node-cron";
import { fetchAllStatuses } from "./status-feed";
import { noSourceAnswered } from "./status-feed/provider-reading";
import { saveStatusResult } from "./db-service";
import { getGlobalLatestStatusCheck } from "./dao";

let isRunning = false;

export async function initCron() {
    if (isRunning) return;
    isRunning = true;

    console.log("Initializing Cron Job...");

    // Check last update time
    try {
        const lastCheck = await getGlobalLatestStatusCheck();

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        if (!lastCheck || !lastCheck.checkedAt || lastCheck.checkedAt < fiveMinutesAgo) {
            console.log("Last update was older than 5 minutes (or never). Triggering immediate update...");
            await runJob();
        } else {
            console.log(`Data is fresh (last updated ${lastCheck.checkedAt.toISOString()}). Skipping immediate update.`);
        }
    } catch (error) {
        console.error("Error checking last update time:", error);
        
        // Fallback to running if check fails
        runJob();
    }

    // Schedule to run every 5 minutes
    cron.schedule("*/5 * * * *", () => {
        console.log("Running scheduled status check...");
        runJob();
    });
}

/** Um Poll: lê todas as fontes e grava, a não ser que nenhuma tenha respondido, que é falha do próprio monitor. */
export async function runJob() {
    try {
        const results = await fetchAllStatuses();
        if (noSourceAnswered(results)) {
            console.error("Poll descartado: nenhuma fonte de nenhum Provider respondeu (falha do próprio monitor). Nada foi gravado.");
            return;
        }
        for (const result of results) {
            await saveStatusResult(result);
        }
        console.log(`Updated status for ${results.length} providers.`);
    } catch (error) {
        console.error("Error in Cron Job:", error);
    }
}
