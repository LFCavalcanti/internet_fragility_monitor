import cron from "node-cron";
import { fetchAllStatuses } from "./fetchers";
import { saveStatusResult, ensureProvidersExist } from "./db-service";
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

async function runJob() {
    try {
        await ensureProvidersExist();
        const results = await fetchAllStatuses();
        for (const result of results) {
            await saveStatusResult(result);
        }
        console.log(`Updated status for ${results.length} providers.`);
    } catch (error) {
        console.error("Error in Cron Job:", error);
    }
}
