const { fetchAllStatuses } = require('./lib/fetchers');
const { saveStatusResult, ensureProvidersExist } = require('./lib/db-service');

async function test() {
    console.log('Ensuring providers exist...');
    await ensureProvidersExist();

    console.log('Fetching statuses...');
    const results = await fetchAllStatuses();

    console.log('Saving results...');
    for (const result of results) {
        console.log(`${result.providerId}: ${result.status}`);
        await saveStatusResult(result);
    }

    console.log('Done!');
    process.exit(0);
}

test().catch(console.error);
