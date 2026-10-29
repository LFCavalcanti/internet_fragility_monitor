/**
 * Tests for lib/db-service.ts - Database service layer
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StatusResult } from '@/lib/fetchers/types';

// Mock the DAO functions
vi.mock('@/lib/dao', () => ({
    upsertProvider: vi.fn().mockResolvedValue(undefined),
    saveStatusCheck: vi.fn().mockResolvedValue(undefined),
    getOpenIncidents: vi.fn().mockResolvedValue([]),
    getAllIncidentsForProvider: vi.fn().mockResolvedValue([]),
    updateIncidentStatus: vi.fn().mockResolvedValue(undefined),
    createIncident: vi.fn().mockResolvedValue('new-incident-id'),
    closeIncident: vi.fn().mockResolvedValue(undefined),
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
    getOpenIncidents,
    getAllIncidentsForProvider,
    updateIncidentStatus,
    createIncident,
    closeIncident,
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
                await saveStatusResult({ providerId: 'aws', status: 'unreachable', incidents: [], responseTime: 0 });
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

            const results = await getLatestStatus(new Date('2026-10-26T15:00:00Z'));

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

        it('traz a falha de leitura como unreachable, com os Incidents gravados', async () => {
            vi.mocked(getAllProviders).mockResolvedValueOnce([
                { id: 'aws', name: 'AWS', url: 'https://aws.amazon.com', type: 'cloud', logo: null },
            ]);
            vi.mocked(getLatestStatusCheck).mockResolvedValueOnce({
                id: 1,
                providerId: 'aws',
                status: 'unreachable',
                responseTime: 0,
                checkedAt: new Date('2026-10-26T15:00:00Z'),
            });
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce([{
                id: 'inc-open',
                providerId: 'aws',
                title: 'Elevated errors',
                description: null,
                status: 'identified',
                kind: 'problem',
                severity: null,
                scheduledFor: null,
                url: null,
                createdAt: new Date('2026-10-26T14:00:00Z'),
                updatedAt: new Date('2026-10-26T14:00:00Z'),
                resolvedAt: null,
            }]);

            const [aws] = await getLatestStatus(new Date('2026-10-26T15:00:00Z'));

            expect(aws.status).toBe('unreachable');
            expect(aws.incidents).toEqual([
                expect.objectContaining({ kind: 'problem', title: 'Elevated errors', status: 'identified' }),
            ]);
        });

        it('traz todos os Incidents ativos, sem corte por quantidade, e só os resolvidos dentro de 48 horas da resolução', async () => {
            const now = new Date('2026-10-28T12:00:00Z');
            const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
            const row = (title: string, status: string, createdAt: Date, resolvedAt: Date | null = null) => ({
                id: `row-${title}`,
                providerId: 'aws',
                title,
                description: null,
                status,
                kind: 'problem',
                severity: null,
                scheduledFor: null,
                url: null,
                createdAt,
                updatedAt: createdAt,
                resolvedAt,
            });
            const active = Array.from({ length: 10 }, (_, i) => row(`Active ${i}`, 'investigating', hoursAgo(24 * (i + 1))));
            const rows = [
                ...active,
                row('Resolved 47h', 'resolved', hoursAgo(24 * 10), hoursAgo(47)),
                row('Resolved 49h', 'resolved', hoursAgo(50), hoursAgo(49)),
                row('Resolved sem hora, criado há 30h', 'resolved', hoursAgo(30)),
                row('Resolved sem hora, criado há 72h', 'resolved', hoursAgo(72)),
            ];

            vi.mocked(getAllProviders).mockResolvedValueOnce([{ id: 'aws', name: 'AWS', url: 'https://aws.amazon.com', type: 'cloud', logo: null }]);
            vi.mocked(getLatestStatusCheck).mockResolvedValueOnce(undefined);
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce(rows);

            const [result] = await getLatestStatus(now);

            expect(result.incidents.map(i => i.title)).toEqual([
                ...active.map(r => r.title),
                'Resolved 47h',
                'Resolved sem hora, criado há 30h',
            ]);
            expect(result.incidents.find(i => i.title === 'Resolved 47h')?.resolvedAt).toEqual(hoursAgo(47));
        });

        it('traz todas as manutenções agendadas e em andamento, fora do corte de 5, e omite as completed', async () => {
            const providers = [{ id: 'cloudflare', name: 'Cloudflare', url: 'https://cloudflare.com', type: 'cdn', logo: null }];
            const row = (i: number, kind: string, status: string, scheduledFor: Date | null) => ({
                id: `row-${kind}-${i}`,
                providerId: 'cloudflare',
                title: `${kind} ${i}`,
                description: null,
                status,
                kind,
                severity: null,
                url: null,
                scheduledFor,
                createdAt: new Date(Date.UTC(2026, 9, 26, 12, 0) - i * 60_000),
                updatedAt: null,
                resolvedAt: null,
            });
            const rows = [
                ...Array.from({ length: 25 }, (_, i) => row(i, 'maintenance', 'scheduled', new Date(Date.UTC(2026, 9, 27, i))),
                ),
                row(30, 'maintenance', 'in_progress', new Date('2026-10-26T10:00:00Z')),
                row(31, 'maintenance', 'completed', new Date('2026-10-25T10:00:00Z')),
                row(40, 'problem', 'identified', null),
            ];

            vi.mocked(getAllProviders).mockResolvedValueOnce(providers);
            vi.mocked(getLatestStatusCheck).mockResolvedValueOnce(undefined);
            vi.mocked(getAllIncidentsForProvider).mockResolvedValueOnce(rows);

            const [result] = await getLatestStatus(new Date('2026-10-26T15:00:00Z'));

            expect(result.incidents.filter(i => i.kind === 'maintenance' && i.status === 'scheduled')).toHaveLength(25);
            expect(result.incidents.filter(i => i.kind === 'maintenance' && i.status === 'in_progress')).toHaveLength(1);
            expect(result.incidents.some(i => i.kind === 'maintenance' && i.status === 'completed')).toBe(false);
            expect(result.incidents.find(i => i.kind === 'problem')).toMatchObject({ title: 'problem 40', status: 'identified' });
            expect(result.incidents.find(i => i.title === 'maintenance 0')).toMatchObject({
                kind: 'maintenance',
                scheduledFor: new Date(Date.UTC(2026, 9, 27, 0)),
            });
        });
    });
});
