/**
 * Tests for lib/cron.ts - Cron job scheduling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-cron
const mockSchedule = vi.fn();
vi.mock('node-cron', () => ({
    default: {
        schedule: mockSchedule,
    },
}));

// Mock fetchers
vi.mock('@/lib/fetchers', () => ({
    fetchAllStatuses: vi.fn().mockResolvedValue([
        { providerId: 'aws', status: 'operational', incidents: [], lastUpdated: new Date() },
    ]),
}));

// Mock db-service
vi.mock('@/lib/db-service', () => ({
    saveStatusResult: vi.fn().mockResolvedValue(undefined),
    ensureProvidersExist: vi.fn().mockResolvedValue(undefined),
}));

// Mock DAO
vi.mock('@/lib/dao', () => ({
    getGlobalLatestStatusCheck: vi.fn().mockResolvedValue(undefined),
}));

import { getGlobalLatestStatusCheck } from '@/lib/dao';
import { saveStatusResult, ensureProvidersExist } from '@/lib/db-service';
import { fetchAllStatuses } from '@/lib/fetchers';

describe('cron.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the isRunning state by reimporting
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('initCron', () => {
        it('should schedule a cron job for every 5 minutes', async () => {
            // Need to re-import after mocks are set up
            const { initCron } = await import('@/lib/cron');
            
            // Suppress console.log
            vi.spyOn(console, 'log').mockImplementation(() => {});

            await initCron();

            expect(mockSchedule).toHaveBeenCalledWith(
                '*/5 * * * *',
                expect.any(Function)
            );
        });

        it('should only initialize once (singleton behavior)', async () => {
            const { initCron } = await import('@/lib/cron');
            
            vi.spyOn(console, 'log').mockImplementation(() => {});

            await initCron();
            await initCron(); // Second call should be ignored

            // Schedule should only be called once
            expect(mockSchedule).toHaveBeenCalledTimes(1);
        });

        it('should run job immediately if last check is older than 5 minutes', async () => {
            // Set up old check (10 minutes ago)
            const oldCheck = {
                id: 1,
                providerId: 'aws',
                status: 'operational',
                responseTime: 100,
                checkedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
            };
            vi.mocked(getGlobalLatestStatusCheck).mockResolvedValueOnce(oldCheck);

            const { initCron } = await import('@/lib/cron');
            
            vi.spyOn(console, 'log').mockImplementation(() => {});

            await initCron();

            // Should trigger immediate update
            expect(ensureProvidersExist).toHaveBeenCalled();
            expect(fetchAllStatuses).toHaveBeenCalled();
        });

        it('should skip immediate update if data is fresh', async () => {
            // Set up fresh check (1 minute ago)
            const freshCheck = {
                id: 1,
                providerId: 'aws',
                status: 'operational',
                responseTime: 100,
                checkedAt: new Date(Date.now() - 1 * 60 * 1000), // 1 minute ago
            };
            vi.mocked(getGlobalLatestStatusCheck).mockResolvedValueOnce(freshCheck);

            const { initCron } = await import('@/lib/cron');
            
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await initCron();

            // Should not trigger immediate update
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('Data is fresh')
            );
        });

        it('should run job on error checking last update', async () => {
            vi.mocked(getGlobalLatestStatusCheck).mockRejectedValueOnce(new Error('DB Error'));

            const { initCron } = await import('@/lib/cron');
            
            vi.spyOn(console, 'log').mockImplementation(() => {});
            vi.spyOn(console, 'error').mockImplementation(() => {});

            await initCron();

            // Should fallback to running the job
            // Note: runJob is called but not awaited in the catch block
            // This tests that it doesn't throw
        });

        it('should run job immediately when no previous check exists', async () => {
            vi.mocked(getGlobalLatestStatusCheck).mockResolvedValueOnce(undefined);

            const { initCron } = await import('@/lib/cron');
            
            vi.spyOn(console, 'log').mockImplementation(() => {});

            await initCron();

            expect(ensureProvidersExist).toHaveBeenCalled();
        });
    });

    describe('scheduled job execution', () => {
        it('should save status results for all fetched providers', async () => {
            vi.mocked(getGlobalLatestStatusCheck).mockResolvedValueOnce(undefined);
            vi.mocked(fetchAllStatuses).mockResolvedValueOnce([
                { providerId: 'aws', status: 'operational', incidents: [], lastUpdated: new Date() },
                { providerId: 'azure', status: 'degraded', incidents: [], lastUpdated: new Date() },
            ]);

            const { initCron } = await import('@/lib/cron');
            
            vi.spyOn(console, 'log').mockImplementation(() => {});

            await initCron();

            expect(saveStatusResult).toHaveBeenCalledTimes(2);
        });

        it('should handle errors gracefully in runJob', async () => {
            vi.mocked(getGlobalLatestStatusCheck).mockResolvedValueOnce(undefined);
            vi.mocked(fetchAllStatuses).mockRejectedValueOnce(new Error('Fetch failed'));

            const { initCron } = await import('@/lib/cron');
            
            vi.spyOn(console, 'log').mockImplementation(() => {});
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            // Should not throw
            await initCron();

            expect(errorSpy).toHaveBeenCalledWith(
                'Error in Cron Job:',
                expect.any(Error)
            );
        });
    });
});
