"use server";

import {
    upsertProvider,
    saveStatusCheck,
    getActiveIncidents,
    getAllIncidentsForProvider,
    updateIncidentStatus,
    createIncident,
    resolveIncident,
    completeMaintenance,
    getAllProviders,
    getLatestStatusCheck,
} from "./dao";
import type { Incident } from "./schema";
import type {
    IncidentData,
    MaintenancePhase,
    ProblemStatus,
    StatusResult,
} from "./fetchers/types";
import { providersList } from "./fetchers";

export async function ensureProvidersExist() {
    for (const p of providersList) {
        await upsertProvider(p);
    }
}

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
    // and the card keeps showing them as Recent Incidents.
    if (result.status === "unreachable") return;

    // 2. Sync Incidents
    // We need to handle:
    // a) New incidents (insert)
    // b) Updated incidents (status, kind or scheduled date changed)
    // c) Stale incidents (close them if they are no longer in the feed)

    // Get all currently open incidents for this provider from DB
    const activeDbIncidents = await getActiveIncidents(result.providerId);
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
            });
        }
    }

    // B. Handle Stale Incidents (close missing)
    // If an incident is open in DB but NOT in the current result list, the provider closed or removed it:
    // a problem becomes resolved and a maintenance becomes completed.
    for (const dbInc of activeDbIncidents) {
        if (!currentIncidentTitles.has(dbInc.title)) {
            console.log(`Closing stale incident: ${dbInc.title} for ${result.providerId}`);
            if (dbInc.kind === "maintenance") {
                await completeMaintenance(dbInc.id);
            } else {
                await resolveIncident(dbInc.id);
            }
        }
    }
}

function toIncidentData(row: Incident): IncidentData {
    const base = {
        title: row.title,
        description: row.description || undefined,
        url: row.url || undefined,
        createdAt: row.createdAt || new Date(),
        updatedAt: row.updatedAt || undefined,
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

export async function getLatestStatus(): Promise<StatusResult[]> {
    const allProviders = await getAllProviders();
    const results: StatusResult[] = [];

    for (const provider of allProviders) {
        // Get latest check
        const latestCheck = await getLatestStatusCheck(provider.id);

        // Get all incidents for this provider (newest first)
        const providerIncidents = await getAllIncidentsForProvider(provider.id);

        // Problems keep the cut at the 5 newest (Ticket 04 replaces it with the Recent Incident rule).
        // Scheduled and in-progress maintenances all come along, so Upcoming Maintenance counts them all;
        // completed maintenances never appear.
        const problems = providerIncidents.filter(i => i.kind !== "maintenance").slice(0, 5);
        const openMaintenances = providerIncidents.filter(
            i => i.kind === "maintenance" && i.status !== "completed",
        );

        // Map back to StatusResult
        results.push({
            providerId: provider.id,
            status: (latestCheck?.status as StatusResult['status']) || "operational",
            responseTime: latestCheck?.responseTime || 0,
            incidents: [...problems, ...openMaintenances].map(toIncidentData),
            lastUpdated: latestCheck?.checkedAt || undefined,
        });
    }

    return results;
}
