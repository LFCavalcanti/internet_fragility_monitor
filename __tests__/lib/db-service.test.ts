/**
 * Tests for lib/db-service.ts - Database service layer
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StatusResult } from '@/lib/fetchers/types';

// Mock the DAO functions
vi.mock('@/lib/dao', () => ({
    upsertProvider: vi.fn().mockResolvedValue(undefined),
    saveStatusCheck: vi.fn().mockResolvedValue(undefined),
    getActiveIncidents: vi.fn().mockResolvedValue([]),
    getAllIncidentsForProvider: vi.fn().mockResolvedValue([]),
    updateIncidentStatus: vi.fn().mockResolvedValue(undefined),
    createIncident: vi.fn().mockResolvedValue('new-incident-id'),
    resolveIncident: vi.fn().mockResolvedValue(undefined),
    getAllProviders: vi.fn().mockResolvedValue([]),
    getLatestStatusCheck: vi.fn().mockResolvedValue(undefined),
}));

// Mock the providers list
vi.mock('@/lib/fetchers', () => ({
    providersList: [
        { id: 'aws', name: 'AWS', url: 'https://aws.amazon.com', type: 'cloud', logo: null },
        { id: 'azure', name: 'Azure', url: 'https://azure.microsoft.com', type: 'cloud', logo: null },
    ],
}));

import {
    ensureProvidersExist,
    saveStatusResult,
    getLatestStatus,
} from '@/lib/db-service';

import {
    upsertProvider,
    saveStatusCheck,
    getActiveIncidents,
    getAllIncidentsForProvider,
    updateIncidentStatus,
    createIncident,
    resolveIncident,
    getAllProviders,
    getLatestStatusCheck,
} from '@/lib/dao';

describe('db-service.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('ensureProvidersExist', () => {
        it('should call upsertProvider for each provider in the list', async () => {
            await ensureProvidersExist();

            expect(upsertProvider).toHaveBeenCalledTimes(2);
            expect(upsertProvider).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'aws' })
            );
            expect(upsertProvider).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'azure' })
            );
        });
    });

    describe('saveStatusResult', () => {
        const baseResult: StatusResult = {
            providerId: 'aws',
            status: 'operational',
            responseTime: 150,
            incidents: [],
            lastUpdated: new Date(),
        };

        it('should save status check for the provider', async () => {
            await saveStatusResult(baseResult);

            expect(saveStatusCheck).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerId: 'aws',
                    status: 'operational',
                    responseTime: 150,
                })
            );
        });

        it('should create new incident when not in database', async () => {
            const resultWithIncident: StatusResult = {
                ...baseResult,
                incidents: [{
                    title: 'New Issue',
                    description: 'Something happened',
                    status: 'investigating',
                    createdAt: new Date(),
                }],
            };

            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([]);
            vi.mocked(getActiveIncidents).mockResolvedValueOnce([]);

            await saveStatusResult(resultWithIncident);

            expect(createIncident).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerId: 'aws',
                    title: 'New Issue',
                    status: 'investigating',
                })
            );
        });

        it('should update incident status when it changed', async () => {
            const existingIncident = {
                id: 'inc-1',
                providerId: 'aws',
                title: 'Existing Issue',
                description: 'Old description',
                status: 'investigating',
                severity: null,
                url: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                resolvedAt: null,
            };

            const resultWithUpdatedIncident: StatusResult = {
                ...baseResult,
                incidents: [{
                    title: 'Existing Issue',
                    description: 'Updated description',
                    status: 'monitoring', // Changed from investigating
                    createdAt: new Date(),
                }],
            };

            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([existingIncident]);
            vi.mocked(getActiveIncidents).mockResolvedValueOnce([existingIncident]);

            await saveStatusResult(resultWithUpdatedIncident);

            expect(updateIncidentStatus).toHaveBeenCalledWith(
                'inc-1',
                'monitoring',
                expect.anything()
            );
        });

        it('should not update incident if status unchanged', async () => {
            const existingIncident = {
                id: 'inc-1',
                providerId: 'aws',
                title: 'Same Issue',
                description: 'Same',
                status: 'investigating',
                severity: null,
                url: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                resolvedAt: null,
            };

            const resultWithSameIncident: StatusResult = {
                ...baseResult,
                incidents: [{
                    title: 'Same Issue',
                    status: 'investigating', // Same status
                    createdAt: new Date(),
                }],
            };

            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([existingIncident]);
            vi.mocked(getActiveIncidents).mockResolvedValueOnce([existingIncident]);

            await saveStatusResult(resultWithSameIncident);

            expect(updateIncidentStatus).not.toHaveBeenCalled();
        });

        it('should resolve stale incidents no longer in the feed', async () => {
            const staleIncident = {
                id: 'inc-stale',
                providerId: 'aws',
                title: 'Stale Issue',
                description: 'Was active, now gone',
                status: 'investigating',
                severity: null,
                url: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                resolvedAt: null,
            };

            // Empty incidents array = all previous incidents should be resolved
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([staleIncident]);
            vi.mocked(getActiveIncidents).mockResolvedValueOnce([staleIncident]);

            // Suppress console.log for this test
            vi.spyOn(console, 'log').mockImplementation(() => {});

            await saveStatusResult(baseResult);

            expect(resolveIncident).toHaveBeenCalledWith('inc-stale');
        });
    });

    describe('getLatestStatus', () => {
        it('should return status results for all providers', async () => {
            const providers = [
                { id: 'aws', name: 'AWS', url: 'https://aws.amazon.com', type: 'cloud', logo: null },
                { id: 'azure', name: 'Azure', url: 'https://azure.microsoft.com', type: 'cloud', logo: null },
            ];

            const awsCheck = {
                id: 1,
                providerId: 'aws',
                status: 'operational',
                responseTime: 100,
                checkedAt: new Date(),
            };

            vi.mocked(getAllProviders).mockResolvedValueOnce(providers);
            vi.mocked(getLatestStatusCheck)
                .mockResolvedValueOnce(awsCheck)
                .mockResolvedValueOnce(undefined);
            vi.mocked(getAllIncidentsForProvider)
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([]);

            const results = await getLatestStatus();

            expect(results).toHaveLength(2);
            expect(results[0]).toMatchObject({
                providerId: 'aws',
                status: 'operational',
            });
            expect(results[1]).toMatchObject({
                providerId: 'azure',
                status: 'operational', // Default when no check found
            });
        });

        it('should include up to 5 incidents per provider', async () => {
            const providers = [{ id: 'aws', name: 'AWS', url: 'https://aws.amazon.com', type: 'cloud', logo: null }];
            const manyIncidents = Array.from({ length: 10 }, (_, i) => ({
                id: `inc-${i}`,
                providerId: 'aws',
                title: `Incident ${i}`,
                description: null,
                status: 'investigating',
                severity: null,
                url: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                resolvedAt: null,
            }));

            vi.mocked(getAllProviders).mockResolvedValueOnce(providers);
            vi.mocked(getLatestStatusCheck).mockResolvedValueOnce(undefined);
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce(manyIncidents);

            const results = await getLatestStatus();

            expect(results[0].incidents).toHaveLength(5);
        });
    });
});
