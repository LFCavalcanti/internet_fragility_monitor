/**
 * Tests for lib/db-service.ts - Database service layer
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StatusResult } from '@/lib/status-feed/types';

// Mock the DAO functions
vi.mock('@/lib/dao', () => ({
    saveStatusCheck: vi.fn().mockResolvedValue(undefined),
    getOpenIncidents: vi.fn().mockResolvedValue([]),
    getAllIncidentsForProvider: vi.fn().mockResolvedValue([]),
    updateIncidentStatus: vi.fn().mockResolvedValue(undefined),
    createIncident: vi.fn().mockResolvedValue('new-incident-id'),
    closeIncident: vi.fn().mockResolvedValue(undefined),
    getActiveProviders: vi.fn().mockResolvedValue([]),
    getActiveSources: vi.fn().mockResolvedValue([]),
    getLatestStatusCheck: vi.fn().mockResolvedValue(undefined),
}));

import { saveStatusResult } from '@/lib/db-service';

import {
    saveStatusCheck,
    getOpenIncidents,
    getAllIncidentsForProvider,
    updateIncidentStatus,
    createIncident,
    closeIncident,
} from '@/lib/dao';

describe('db-service.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('saveStatusResult', () => {
        const baseResult: StatusResult = {
            providerId: 'aws',
            status: 'operational',
            incidents: [],
            lastUpdated: new Date(),
        };

        it('should save status check for the provider', async () => {
            await saveStatusResult(baseResult);

            expect(saveStatusCheck).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerId: 'aws',
                    status: 'operational',
                })
            );
        });

        it('não grava tempo de resposta: a duração da leitura vai só para o log', async () => {
            await saveStatusResult(baseResult);

            expect(vi.mocked(saveStatusCheck).mock.calls[0][0].responseTime).toBeUndefined();
        });

        it('should create new incident when not in database', async () => {
            const resultWithIncident: StatusResult = {
                ...baseResult,
                incidents: [{
                    kind: 'problem',
                    title: 'New Issue',
                    description: 'Something happened',
                    status: 'investigating',
                    createdAt: new Date(),
                }],
            };

            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([]);
            vi.mocked(getOpenIncidents).mockResolvedValueOnce([]);

            await saveStatusResult(resultWithIncident);

            expect(createIncident).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerId: 'aws',
                    title: 'New Issue',
                    status: 'investigating',
                })
            );
        });

        it('grava a hora de resolução que o Feed publica num Incident novo já resolvido', async () => {
            const resolvedAt = new Date('2026-10-27T08:00:00Z');
            await saveStatusResult({
                ...baseResult,
                incidents: [{
                    kind: 'problem',
                    title: 'Cloud Run: elevated latency',
                    status: 'resolved',
                    createdAt: new Date('2026-10-25T08:00:00Z'),
                    resolvedAt,
                }],
            });

            expect(createIncident).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Cloud Run: elevated latency', status: 'resolved', resolvedAt }),
            );
        });

        it('should update incident status when it changed', async () => {
            const existingIncident = {
                id: 'inc-1',
                providerId: 'aws',
                title: 'Existing Issue',
                description: 'Old description',
                status: 'investigating',
                kind: 'problem',
                severity: null,
                scheduledFor: null,
                url: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                resolvedAt: null,
            };

            const resultWithUpdatedIncident: StatusResult = {
                ...baseResult,
                incidents: [{
                    kind: 'problem',
                    title: 'Existing Issue',
                    description: 'Updated description',
                    status: 'monitoring', // Changed from investigating
                    createdAt: new Date(),
                }],
            };

            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([existingIncident]);
            vi.mocked(getOpenIncidents).mockResolvedValueOnce([existingIncident]);

            await saveStatusResult(resultWithUpdatedIncident);

            expect(updateIncidentStatus).toHaveBeenCalledWith(
                'inc-1',
                'monitoring',
                expect.anything(),
                { kind: 'problem', scheduledFor: null }
            );
        });

        it('should not update incident if status unchanged', async () => {
            const existingIncident = {
                id: 'inc-1',
                providerId: 'aws',
                title: 'Same Issue',
                description: 'Same',
                status: 'investigating',
                kind: 'problem',
                severity: null,
                scheduledFor: null,
                url: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                resolvedAt: null,
            };

            const resultWithSameIncident: StatusResult = {
                ...baseResult,
                incidents: [{
                    kind: 'problem',
                    title: 'Same Issue',
                    status: 'investigating', // Same status
                    createdAt: new Date(),
                }],
            };

            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([existingIncident]);
            vi.mocked(getOpenIncidents).mockResolvedValueOnce([existingIncident]);

            await saveStatusResult(resultWithSameIncident);

            expect(updateIncidentStatus).not.toHaveBeenCalled();
        });

        it('encerra como problema o Incident que saiu do Feed', async () => {
            const staleIncident = {
                id: 'inc-stale',
                providerId: 'aws',
                title: 'Stale Issue',
                description: 'Was active, now gone',
                status: 'investigating',
                kind: 'problem',
                severity: null,
                scheduledFor: null,
                url: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                resolvedAt: null,
            };

            // Empty incidents array = all previous incidents should be resolved
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([staleIncident]);
            vi.mocked(getOpenIncidents).mockResolvedValueOnce([staleIncident]);

            // Suppress console.log for this test
            vi.spyOn(console, 'log').mockImplementation(() => {});

            await saveStatusResult(baseResult);

            expect(closeIncident).toHaveBeenCalledWith('inc-stale', 'problem');
        });

        it('falha de leitura grava unreachable e não encerra nem altera os Incidents gravados', async () => {
            const openProblem = {
                id: 'inc-open',
                providerId: 'aws',
                title: 'Elevated errors',
                description: null,
                status: 'identified',
                kind: 'problem',
                severity: null,
                scheduledFor: null,
                url: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                resolvedAt: null,
            };
            const openMaintenance = { ...openProblem, id: 'mnt-open', title: 'Network upgrade', status: 'in_progress', kind: 'maintenance' };
            vi.mocked(getAllIncidentsForProvider).mockResolvedValue([openProblem, openMaintenance]);
            vi.mocked(getOpenIncidents).mockResolvedValue([openProblem, openMaintenance]);

            try {
                await saveStatusResult({ providerId: 'aws', status: 'unreachable', incidents: [] });
            } finally {
                vi.mocked(getAllIncidentsForProvider).mockResolvedValue([]);
                vi.mocked(getOpenIncidents).mockResolvedValue([]);
            }

            expect(saveStatusCheck).toHaveBeenCalledWith(
                expect.objectContaining({ providerId: 'aws', status: 'unreachable' }),
            );
            expect(closeIncident).not.toHaveBeenCalled();
            expect(updateIncidentStatus).not.toHaveBeenCalled();
            expect(createIncident).not.toHaveBeenCalled();
        });

        const maintenanceRow = (overrides: Record<string, unknown> = {}) => ({
            id: 'mnt-1',
            providerId: 'cloudflare',
            title: 'LIM (Lima) datacenter',
            description: null,
            status: 'scheduled',
            kind: 'maintenance',
            severity: null,
            url: null,
            scheduledFor: new Date('2026-10-27T05:00:00Z') as Date | null,
            createdAt: new Date('2026-10-20T10:00:00Z'),
            updatedAt: new Date('2026-10-20T10:00:00Z'),
            resolvedAt: null,
            ...overrides,
        });

        it('grava manutenção nova com tipo, fase e data marcada', async () => {
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([]);
            vi.mocked(getOpenIncidents).mockResolvedValueOnce([]);

            await saveStatusResult({
                ...baseResult,
                providerId: 'cloudflare',
                incidents: [{
                    kind: 'maintenance',
                    title: 'LIM (Lima) datacenter',
                    status: 'scheduled',
                    scheduledFor: new Date('2026-10-27T05:00:00Z'),
                    createdAt: new Date('2026-10-20T10:00:00Z'),
                }],
            });

            expect(createIncident).toHaveBeenCalledWith(expect.objectContaining({
                providerId: 'cloudflare',
                kind: 'maintenance',
                status: 'scheduled',
                scheduledFor: new Date('2026-10-27T05:00:00Z'),
            }));
        });

        it('grava problema novo com tipo problema e sem data marcada', async () => {
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([]);
            vi.mocked(getOpenIncidents).mockResolvedValueOnce([]);

            await saveStatusResult({
                ...baseResult,
                incidents: [{ kind: 'problem', title: 'API errors', status: 'investigating', createdAt: new Date() }],
            });

            expect(createIncident).toHaveBeenCalledWith(expect.objectContaining({
                kind: 'problem',
                status: 'investigating',
                scheduledFor: null,
            }));
        });

        it('o Poll seguinte atualiza a manutenção migrada como completed que continua no Feed', async () => {
            const migrated = maintenanceRow({ status: 'completed', scheduledFor: null });
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([migrated]);
            vi.mocked(getOpenIncidents).mockResolvedValueOnce([]);

            await saveStatusResult({
                ...baseResult,
                providerId: 'cloudflare',
                incidents: [{
                    kind: 'maintenance',
                    title: 'LIM (Lima) datacenter',
                    status: 'scheduled',
                    scheduledFor: new Date('2026-10-27T05:00:00Z'),
                    createdAt: new Date('2026-10-20T10:00:00Z'),
                }],
            });

            expect(updateIncidentStatus).toHaveBeenCalledWith(
                'mnt-1',
                'scheduled',
                undefined,
                { kind: 'maintenance', scheduledFor: new Date('2026-10-27T05:00:00Z') },
            );
        });

        it('atualiza a manutenção quando a data marcada muda, mesmo com a fase igual', async () => {
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([maintenanceRow()]);
            vi.mocked(getOpenIncidents).mockResolvedValueOnce([maintenanceRow()]);

            await saveStatusResult({
                ...baseResult,
                providerId: 'cloudflare',
                incidents: [{
                    kind: 'maintenance',
                    title: 'LIM (Lima) datacenter',
                    status: 'scheduled',
                    scheduledFor: new Date('2026-10-28T05:00:00Z'),
                    createdAt: new Date('2026-10-20T10:00:00Z'),
                }],
            });

            expect(updateIncidentStatus).toHaveBeenCalledWith(
                'mnt-1',
                'scheduled',
                undefined,
                { kind: 'maintenance', scheduledFor: new Date('2026-10-28T05:00:00Z') },
            );
        });

        it('não atualiza manutenção sem mudança de fase nem de data', async () => {
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([maintenanceRow()]);
            vi.mocked(getOpenIncidents).mockResolvedValueOnce([maintenanceRow()]);

            await saveStatusResult({
                ...baseResult,
                providerId: 'cloudflare',
                incidents: [{
                    kind: 'maintenance',
                    title: 'LIM (Lima) datacenter',
                    status: 'scheduled',
                    scheduledFor: new Date('2026-10-27T05:00:00Z'),
                    createdAt: new Date('2026-10-20T10:00:00Z'),
                }],
            });

            expect(updateIncidentStatus).not.toHaveBeenCalled();
        });

        it('manutenção que some do Feed é encerrada como manutenção, não como problema', async () => {
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([maintenanceRow({ status: 'in_progress' })]);
            vi.mocked(getOpenIncidents).mockResolvedValueOnce([maintenanceRow({ status: 'in_progress' })]);
            vi.spyOn(console, 'log').mockImplementation(() => {});

            await saveStatusResult({ ...baseResult, providerId: 'cloudflare' });

            expect(closeIncident).toHaveBeenCalledWith('mnt-1', 'maintenance');
            expect(closeIncident).toHaveBeenCalledTimes(1);
        });
    });
});
