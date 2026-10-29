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
    getProviderById,
    getLatestStatusCheck,
    getGlobalLatestStatusCheck,
    saveStatusCheck,
    getOpenIncidents,
    getAllIncidentsForProvider,
    getIncidentByTitle,
    upsertIncident,
    createIncident,
    updateIncidentStatus,
    closeIncident,
} from '@/lib/dao';

describe('dao.ts', () => {
    let mockDb: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = getDb();
    });

    describe('Provider Operations', () => {
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

            it('grava a falha de leitura como unreachable', async () => {
                await saveStatusCheck({ providerId: 'aws', status: 'unreachable', responseTime: 0 });

                expect(mockDb.values).toHaveBeenCalledWith(
                    expect.objectContaining({ providerId: 'aws', status: 'unreachable' }),
                );
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
        describe('getOpenIncidents', () => {
            it('devolve os Incidents abertos do Provider', async () => {
                const mockIncidents = [
                    { id: 'inc-1', providerId: 'aws', title: 'Issue 1', status: 'investigating', createdAt: new Date() },
                ];
                mockDb.query.incidents.findMany = vi.fn().mockResolvedValueOnce(mockIncidents);

                const result = await getOpenIncidents('aws');

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

        describe('closeIncident', () => {
            it('encerra um problema como resolved, com a hora do encerramento', async () => {
                await closeIncident('inc-123', 'problem');

                expect(mockDb.update).toHaveBeenCalled();
                expect(mockDb.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        status: 'resolved',
                        resolvedAt: expect.any(Date),
                    })
                );
            });

            it('encerra a manutenção com a fase completed e a hora do encerramento', async () => {
                await closeIncident('mnt-1', 'maintenance');

                expect(mockDb.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        status: 'completed',
                        resolvedAt: expect.any(Date),
                    })
                );
            });

            it('should throw validation error for empty ID', async () => {
                await expect(closeIncident('', 'problem')).rejects.toThrow('Validation failed');
            });
        });

        describe('updateIncidentStatus com tipo e data marcada', () => {
            it('grava o tipo e a data marcada recebidos', async () => {
                const scheduledFor = new Date('2026-10-27T05:00:00Z');
                await updateIncidentStatus('mnt-1', 'scheduled', undefined, { kind: 'maintenance', scheduledFor });

                expect(mockDb.set).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'scheduled', kind: 'maintenance', scheduledFor })
                );
                expect(mockDb.set).not.toHaveBeenCalledWith(
                    expect.objectContaining({ resolvedAt: expect.any(Date) })
                );
            });

            it('Incident encerrado que volta a uma fase aberta perde a hora do encerramento', async () => {
                // ex.: manutenção encerrada pela migration 0002 que reaparece no Feed como scheduled
                await updateIncidentStatus('mnt-1', 'scheduled', undefined, { kind: 'maintenance', scheduledFor: null });

                expect(mockDb.set).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'scheduled', resolvedAt: null })
                );
            });

            it('problema que volta de resolved para investigating perde a hora do encerramento', async () => {
                await updateIncidentStatus('inc-1', 'investigating');

                expect(mockDb.set).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'investigating', resolvedAt: null })
                );
            });

            it('fase completed marca a hora do encerramento', async () => {
                await updateIncidentStatus('mnt-1', 'completed', undefined, { kind: 'maintenance', scheduledFor: null });

                expect(mockDb.set).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'completed', resolvedAt: expect.any(Date) })
                );
            });
        });
    });
});
