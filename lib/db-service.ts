"use server";

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
} from "./dao";
import { StatusResult } from "./fetchers/types";
import { providersList } from "./fetchers";

export async function ensureProvidersExist() {
    for (const p of providersList) {
        await upsertProvider(p);
    }
}

export async function saveStatusResult(result: StatusResult) {
    // 1. Save Status Check
    await saveStatusCheck({
        providerId: result.providerId,
        status: result.status,
        responseTime: result.responseTime,
        checkedAt: new Date(),
    });

    // 2. Sync Incidents
    // We need to handle:
    // a) New incidents (insert)
    // b) Updated incidents (update status)
    // c) Stale incidents (resolve if they are no longer in the feed)

    // Get all currently active incidents for this provider from DB
    const activeDbIncidents = await getActiveIncidents(result.providerId);
    const allDbIncidents = await getAllIncidentsForProvider(result.providerId);

    // Filter for truly active ones in DB (not resolved)
    const trulyActiveDbIncidents = activeDbIncidents.filter(i => i.status !== 'resolved');

    const currentIncidentTitles = new Set(result.incidents.map(i => i.title));

    // A. Handle Incoming Incidents (Insert or Update)
    for (const inc of result.incidents) {
        const existing = allDbIncidents.find(i => i.title === inc.title);

        if (existing) {
            // Update if status changed
            if (existing.status !== inc.status) {
                await updateIncidentStatus(
                    existing.id,
                    inc.status,
                    inc.description || existing.description || undefined
                );
            }
        } else {
            // Insert new incident
            await createIncident({
                providerId: result.providerId,
                title: inc.title,
                description: inc.description,
                status: inc.status,
                url: inc.url,
                createdAt: inc.createdAt,
            });
        }
    }

    // B. Handle Stale Incidents (Resolve missing)
    // If an incident is in DB as active, but NOT in the current result list, it means it's been resolved/removed by provider.
    for (const dbInc of trulyActiveDbIncidents) {
        if (!currentIncidentTitles.has(dbInc.title)) {
            console.log(`Resolving stale incident: ${dbInc.title} for ${result.providerId}`);
            await resolveIncident(dbInc.id);
        }
    }
}

export async function getLatestStatus(): Promise<StatusResult[]> {
    const allProviders = await getAllProviders();
    const results: StatusResult[] = [];

    for (const provider of allProviders) {
        // Get latest check
        const latestCheck = await getLatestStatusCheck(provider.id);

        // Get all incidents for this provider (active + recent)
        const providerIncidents = await getAllIncidentsForProvider(provider.id);

        // Map back to StatusResult
        results.push({
            providerId: provider.id,
            status: (latestCheck?.status as StatusResult['status']) || "operational",
            responseTime: latestCheck?.responseTime || 0,
            incidents: providerIncidents.slice(0, 5).map(i => ({
                title: i.title,
                description: i.description || undefined,
                url: i.url || undefined,
                status: i.status as StatusResult['incidents'][0]['status'],
                createdAt: i.createdAt || new Date(),
                updatedAt: i.updatedAt || undefined,
            })),
            lastUpdated: latestCheck?.checkedAt || undefined,
        });
    }

    return results;
}
