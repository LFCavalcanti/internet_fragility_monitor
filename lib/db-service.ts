"use server";

import {
    saveStatusCheck,
    getOpenIncidents,
    getAllIncidentsForProvider,
    updateIncidentStatus,
    createIncident,
    closeIncident,
    getActiveProviders,
    getActiveSources,
    getLatestStatusCheck,
} from "./dao";
import type { Incident, Provider } from "./schema";
import type {
    IncidentData,
    MaintenancePhase,
    ProblemStatus,
    StatusResult,
} from "./fetchers/types";
import { isClosed, isRecentlyResolved } from "./incident-status";
import { isAccessOnly, sourcesByProvider } from "./provider-catalog";
import type { SnapshotEntry, SnapshotProvider } from "./snapshot-reading";

function scheduledForOf(inc: IncidentData): Date | null {
    return inc.kind === "maintenance" ? inc.scheduledFor ?? null : null;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
    return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

export async function saveStatusResult(result: StatusResult) {
    // 1. Save Status Check
    await saveStatusCheck({
        providerId: result.providerId,
        status: result.status,
        responseTime: result.responseTime,
        checkedAt: new Date(),
    });

    // A read failure says nothing about the Provider's Incidents: the recorded ones stay as they are,
    // and the card keeps showing them as Recent Incidents. Probes never declare Incidents either.
    if (result.status === "unreachable" || result.accessOnly) return;

    // 2. Sync Incidents
    // We need to handle:
    // a) New incidents (insert)
    // b) Updated incidents (status, kind or scheduled date changed)
    // c) Incidents that left the Feed (close them)

    // Get all currently open incidents for this provider from DB (scheduled maintenances included)
    const openDbIncidents = await getOpenIncidents(result.providerId);
    const allDbIncidents = await getAllIncidentsForProvider(result.providerId);

    const currentIncidentTitles = new Set(result.incidents.map(i => i.title));

    // A. Handle Incoming Incidents (Insert or Update)
    for (const inc of result.incidents) {
        const existing = allDbIncidents.find(i => i.title === inc.title);
        const scheduledFor = scheduledForOf(inc);

        if (existing) {
            const changed =
                existing.status !== inc.status ||
                existing.kind !== inc.kind ||
                !sameInstant(existing.scheduledFor, scheduledFor);
            if (changed) {
                await updateIncidentStatus(
                    existing.id,
                    inc.status,
                    inc.description || existing.description || undefined,
                    { kind: inc.kind, scheduledFor },
                );
            }
        } else {
            // Insert new incident
            await createIncident({
                providerId: result.providerId,
                title: inc.title,
                description: inc.description,
                status: inc.status,
                kind: inc.kind,
                scheduledFor,
                url: inc.url,
                createdAt: inc.createdAt,
                // Já encerrado no Feed: a hora de resolução publicada, para a janela de Recent Incident.
                resolvedAt: isClosed(inc) ? inc.resolvedAt ?? null : null,
            });
        }
    }

    // B. Handle Incidents that left the Feed
    // If an incident is open in DB but NOT in the current result list, the provider closed or removed it:
    // a problem becomes resolved and a maintenance becomes completed.
    for (const dbInc of openDbIncidents) {
        if (!currentIncidentTitles.has(dbInc.title)) {
            console.log(`Closing incident that left the Feed: ${dbInc.title} for ${result.providerId}`);
            await closeIncident(dbInc.id, dbInc.kind === "maintenance" ? "maintenance" : "problem");
        }
    }
}

/** Borda do Snapshot: os campos anuláveis do catálogo viram opcionais uma vez, aqui. */
function toSnapshotProvider(row: Provider): SnapshotProvider {
    return {
        id: row.id,
        name: row.name,
        logo: row.logo ?? undefined,
        statusPageUrl: row.statusPageUrl ?? undefined,
        isMajor: row.isMajor,
    };
}

function toIncidentData(row: Incident): IncidentData {
    const base = {
        title: row.title,
        description: row.description || undefined,
        url: row.url || undefined,
        createdAt: row.createdAt || new Date(),
        updatedAt: row.updatedAt || undefined,
        resolvedAt: row.resolvedAt || undefined,
    };
    if (row.kind === "maintenance") {
        return {
            ...base,
            kind: "maintenance",
            status: row.status as MaintenancePhase,
            scheduledFor: row.scheduledFor || undefined,
        };
    }
    return { ...base, kind: "problem", status: row.status as ProblemStatus };
}

/**
 * Leitura do Snapshot, guiada pelo Provider Catalog: os Providers ativos, na ordem de exibição, cada um com seus dados.
 * Por Provider, traz os Incidents que o módulo de Provider Status pode exibir ou contar:
 * todos os abertos (problemas, manutenções agendadas e em andamento), sem corte por quantidade,
 * e os problemas resolvidos dentro da janela de Recent Incident. Manutenção completed nunca vem.
 * `now` é o mesmo relógio que a página passa ao módulo.
 */
export async function getLatestStatus(now: Date): Promise<SnapshotEntry[]> {
    const activeProviders = await getActiveProviders();
    const sources = sourcesByProvider(await getActiveSources());
    const entries: SnapshotEntry[] = [];

    for (const provider of activeProviders) {
        const latestCheck = await getLatestStatusCheck(provider.id);

        // All recorded incidents for this provider (newest first)
        const providerIncidents = await getAllIncidentsForProvider(provider.id);
        const incidents = providerIncidents
            .map(toIncidentData)
            .filter(i => !isClosed(i) || isRecentlyResolved(i, now));

        entries.push({
            provider: toSnapshotProvider(provider),
            result: {
                providerId: provider.id,
                status: (latestCheck?.status as StatusResult['status']) || "operational",
                responseTime: latestCheck?.responseTime || 0,
                incidents,
                lastUpdated: latestCheck?.checkedAt || undefined,
                accessOnly: isAccessOnly(sources.get(provider.id) ?? []),
            },
        });
    }

    return entries;
}
