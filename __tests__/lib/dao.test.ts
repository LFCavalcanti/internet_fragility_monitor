/**
 * Tests for lib/dao.ts - Data Access Object layer
 * 
 * These tests mock the database to test the DAO functions in isolation.
 * They verify input validation and correct database operation calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('@/lib/db', () => {
    const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(undefined),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        query: {
            statusChecks: {
                findFirst: vi.fn().mockResolvedValue(undefined),
            },
            incidents: {
                findMany: vi.fn().mockResolvedValue([]),
                findFirst: vi.fn().mockResolvedValue(undefined),
            },
        },
    };
    return {
        getDb: vi.fn().mockReturnValue(mockDb),
        db: mockDb,
        __mockDb: mockDb, // Export for test access
    };
});

// Import mocks and functions after mocking
import { getDb } from '@/lib/db';
import {
    getAllProviders,
    getProviderById,
    upsertProvider,
    getLatestStatusCheck,
    getGlobalLatestStatusCheck,
    saveStatusCheck,
    getActiveIncidents,
    getAllIncidentsForProvider,
    getIncidentByTitle,
    upsertIncident,
    createIncident,
    updateIncidentStatus,
    resolveIncident,
} from '@/lib/dao';

describe('dao.ts', () => {
    let mockDb: ReturnType<typeof getDb>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = getDb();
    });

    describe('Provider Operations', () => {
        describe('getAllProviders', () => {
            it('should call db.select().from(providers).all()', async () => {
                const mockProviders = [
                    { id: 'aws', name: 'AWS', url: 'https://aws.amazon.com', type: 'cloud', logo: null },
                ];
                (mockDb.all as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockProviders);

                const result = await getAllProviders();

                expect(mockDb.select).toHaveBeenCalled();
                expect(mockDb.from).toHaveBeenCalled();
                expect(mockDb.all).toHaveBeenCalled();
                expect(result).toEqual(mockProviders);
            });
        });

        describe('getProviderById', () => {
            it('should validate ID and return provider when found', async () => {
                const mockProvider = { id: 'aws', name: 'AWS', url: 'https://aws.amazon.com', type: 'cloud', logo: null };
                (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockProvider);

                const result = await getProviderById('aws');

                expect(mockDb.select).toHaveBeenCalled();
                expect(result).toEqual(mockProvider);
            });

            it('should throw validation error for empty ID', async () => {
                await expect(getProviderById('')).rejects.toThrow('Validation failed');
            });

            it('should return undefined when provider not found', async () => {
                (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

                const result = await getProviderById('nonexistent');

                expect(result).toBeUndefined();
            });
        });

        describe('upsertProvider', () => {
            const validProvider = {
                id: 'cloudflare',
                name: 'Cloudflare',
                url: 'https://www.cloudflare.com',
                type: 'cdn',
                logo: '/logos/cloudflare.svg',
            };

            it('should insert new provider when not existing', async () => {
                (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

                await upsertProvider(validProvider);

                expect(mockDb.insert).toHaveBeenCalled();
                expect(mockDb.values).toHaveBeenCalled();
            });

            it('should update existing provider', async () => {
                (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validProvider);

                await upsertProvider({ ...validProvider, name: 'Cloudflare Updated' });

                expect(mockDb.update).toHaveBeenCalled();
                expect(mockDb.set).toHaveBeenCalled();
            });

            it('should throw validation error for invalid provider data', async () => {
                await expect(upsertProvider({
                    id: '',
                    name: 'Test',
                    url: 'https://test.com',
                    type: 'other',
                })).rejects.toThrow('Validation failed');
            });
        });
    });

    describe('Status Check Operations', () => {
        describe('getLatestStatusCheck', () => {
            it('should validate provider ID and query status checks', async () => {
                const mockCheck = {
                    id: 1,
                    providerId: 'aws',
                    status: 'operational',
                    responseTime: 150,
                    checkedAt: new Date(),
                };
                mockDb.query.statusChecks.findFirst = vi.fn().mockResolvedValueOnce(mockCheck);

                const result = await getLatestStatusCheck('aws');

                expect(mockDb.query.statusChecks.findFirst).toHaveBeenCalled();
                expect(result).toEqual(mockCheck);
            });

            it('should throw validation error for empty provider ID', async () => {
                await expect(getLatestStatusCheck('')).rejects.toThrow('Validation failed');
            });
        });

        describe('getGlobalLatestStatusCheck', () => {
            it('should return the most recent status check globally', async () => {
                const mockCheck = {
                    id: 5,
                    providerId: 'azure',
                    status: 'degraded',
                    responseTime: 300,
                    checkedAt: new Date(),
                };
                mockDb.query.statusChecks.findFirst = vi.fn().mockResolvedValueOnce(mockCheck);

                const result = await getGlobalLatestStatusCheck();

                expect(mockDb.query.statusChecks.findFirst).toHaveBeenCalled();
                expect(result).toEqual(mockCheck);
            });
        });

        describe('saveStatusCheck', () => {
            it('should insert a new status check with current date if not provided', async () => {
                await saveStatusCheck({
                    providerId: 'aws',
                    status: 'operational',
                    responseTime: 100,
                });

                expect(mockDb.insert).toHaveBeenCalled();
                expect(mockDb.values).toHaveBeenCalled();
            });

            it('should throw validation error for invalid status', async () => {
                await expect(saveStatusCheck({
                    providerId: 'aws',
                    status: 'invalid-status' as any,
                })).rejects.toThrow('Validation failed');
            });
        });
    });

    describe('Incident Operations', () => {
        describe('getActiveIncidents', () => {
            it('should return non-resolved incidents for provider', async () => {
                const mockIncidents = [
                    { id: 'inc-1', providerId: 'aws', title: 'Issue 1', status: 'investigating', createdAt: new Date() },
                ];
                mockDb.query.incidents.findMany = vi.fn().mockResolvedValueOnce(mockIncidents);

                const result = await getActiveIncidents('aws');

                expect(mockDb.query.incidents.findMany).toHaveBeenCalled();
                expect(result).toEqual(mockIncidents);
            });
        });

        describe('getAllIncidentsForProvider', () => {
            it('should return all incidents for a provider', async () => {
                const mockIncidents = [
                    { id: 'inc-1', providerId: 'aws', title: 'Issue 1', status: 'resolved', createdAt: new Date() },
                    { id: 'inc-2', providerId: 'aws', title: 'Issue 2', status: 'monitoring', createdAt: new Date() },
                ];
                mockDb.query.incidents.findMany = vi.fn().mockResolvedValueOnce(mockIncidents);

                const result = await getAllIncidentsForProvider('aws');

                expect(result).toHaveLength(2);
            });
        });

        describe('getIncidentByTitle', () => {
            it('should find incident by provider ID and title', async () => {
                const mockIncident = { id: 'inc-1', providerId: 'aws', title: 'API Latency', status: 'investigating' };
                mockDb.query.incidents.findFirst = vi.fn().mockResolvedValueOnce(mockIncident);

                const result = await getIncidentByTitle('aws', 'API Latency');

                expect(result).toEqual(mockIncident);
            });

            it('should throw validation error for empty title', async () => {
                await expect(getIncidentByTitle('aws', '')).rejects.toThrow('Validation failed');
            });
        });

        describe('upsertIncident', () => {
            const validIncident = {
                id: 'inc-123',
                providerId: 'aws',
                title: 'Service Degradation',
                description: 'Some regions affected',
                status: 'investigating',
                severity: 'minor',
                url: null,
            };

            it('should insert new incident if not existing', async () => {
                (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

                await upsertIncident(validIncident);

                expect(mockDb.insert).toHaveBeenCalled();
            });

            it('should update existing incident', async () => {
                (mockDb.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(validIncident);

                await upsertIncident({ ...validIncident, status: 'monitoring' });

                expect(mockDb.update).toHaveBeenCalled();
            });
        });

        describe('createIncident', () => {
            it('should create incident with generated UUID and return ID', async () => {
                const result = await createIncident({
                    providerId: 'aws',
                    title: 'New Issue',
                    description: 'Something went wrong',
                    status: 'investigating',
                });

                expect(result).toBeDefined();
                expect(typeof result).toBe('string');
                expect(result.length).toBeGreaterThan(0);
                expect(mockDb.insert).toHaveBeenCalled();
            });
        });

        describe('updateIncidentStatus', () => {
            it('should update incident status', async () => {
                await updateIncidentStatus('inc-123', 'monitoring', 'Being watched');

                expect(mockDb.update).toHaveBeenCalled();
                expect(mockDb.set).toHaveBeenCalled();
            });

            it('should set resolvedAt when status is resolved', async () => {
                await updateIncidentStatus('inc-123', 'resolved');

                expect(mockDb.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        status: 'resolved',
                        resolvedAt: expect.any(Date),
                    })
                );
            });
        });

        describe('resolveIncident', () => {
            it('should mark incident as resolved with current timestamp', async () => {
                await resolveIncident('inc-123');

                expect(mockDb.update).toHaveBeenCalled();
                expect(mockDb.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        status: 'resolved',
                        resolvedAt: expect.any(Date),
                    })
                );
            });

            it('should throw validation error for empty ID', async () => {
                await expect(resolveIncident('')).rejects.toThrow('Validation failed');
            });
        });
    });
});
