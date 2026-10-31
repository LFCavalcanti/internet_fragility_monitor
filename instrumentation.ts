export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { getDb } = await import('./lib/db');
        const { initCron } = await import('./lib/cron');
        initCron(getDb());
    }
}
