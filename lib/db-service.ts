import { db } from "./db";
import { incidents, statusChecks, providers } from "./schema";
import { StatusResult, IncidentData } from "./fetchers/types";
import { providersList } from "./fetchers";
import { eq, desc, and } from "drizzle-orm";

export async function ensureProvidersExist() {
    for (const p of providersList) {
        const existing = await db.select().from(providers).where(eq(providers.id, p.id)).get();
        if (!existing) {
            await db.insert(providers).values(p);
        } else {
            // Update existing provider to sync any changes (like logo URLs)
            await db.update(providers).set(p).where(eq(providers.id, p.id));
        }
    }
}

export async function saveStatusResult(result: StatusResult) {
    // 1. Save Status Check
    await db.insert(statusChecks).values({
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
    const activeDbIncidents = await db.query.incidents.findMany({
        where: and(
            eq(incidents.providerId, result.providerId),
            // Consider active if not resolved
            // Note: We might want to keep 'maintenance' active until it's gone from feed
            // For simplicity, let's just say anything not 'resolved' is active
            // But we need to be careful with 'maintenance' vs 'scheduled' mapping
        ),
    });

    // Filter for truly active ones in DB (not resolved)
    const trulyActiveDbIncidents = activeDbIncidents.filter(i => i.status !== 'resolved');

    const currentIncidentTitles = new Set(result.incidents.map(i => i.title));

    // A. Handle Incoming Incidents (Insert or Update)
    for (const inc of result.incidents) {
        const existing = activeDbIncidents.find(i => i.title === inc.title);

        if (existing) {
            // Update if status changed
            if (existing.status !== inc.status) {
                await db.update(incidents)
                    .set({
                        status: inc.status,
                        updatedAt: new Date(),
                        description: inc.description || existing.description
                    })
                    .where(eq(incidents.id, existing.id));
            }
        } else {
            // Insert new
            await db.insert(incidents).values({
                id: crypto.randomUUID(),
                providerId: result.providerId,
                title: inc.title,
                description: inc.description,
                status: inc.status,
                url: inc.url,
                createdAt: inc.createdAt,
                updatedAt: new Date(),
            });
        }
    }

    // B. Handle Stale Incidents (Resolve missing)
    // If an incident is in DB as active, but NOT in the current result list, it means it's been resolved/removed by provider.
    for (const dbInc of trulyActiveDbIncidents) {
        if (!currentIncidentTitles.has(dbInc.title)) {
            console.log(`Resolving stale incident: ${dbInc.title} for ${result.providerId}`);
            await db.update(incidents)
                .set({
                    status: 'resolved',
                    updatedAt: new Date()
                })
                .where(eq(incidents.id, dbInc.id));
        }
    }
}

export async function getLatestStatus(): Promise<StatusResult[]> {
    const allProviders = await db.select().from(providers);
    const results: StatusResult[] = [];

    for (const provider of allProviders) {
        // Get latest check
        const latestCheck = await db.query.statusChecks.findFirst({
            where: eq(statusChecks.providerId, provider.id),
            orderBy: [desc(statusChecks.checkedAt)],
        });

        // Get active incidents (not resolved) or recent resolved (last 24h)
        // For simplicity, let's just get all incidents for this provider and filter in memory or limit query
        // A better approach for production: filter by status != 'resolved' OR resolvedAt > 24h ago

        const providerIncidents = await db.query.incidents.findMany({
            where: eq(incidents.providerId, provider.id),
            orderBy: [desc(incidents.createdAt)],
        });

        // Map back to StatusResult
        results.push({
            providerId: provider.id,
            status: (latestCheck?.status as any) || "unknown",
            responseTime: latestCheck?.responseTime || 0,
            incidents: providerIncidents.slice(0, 5).map(i => ({
                title: i.title,
                description: i.description || undefined,
                url: i.url || undefined,
                status: i.status as any,
                createdAt: i.createdAt || new Date(),
                updatedAt: i.updatedAt || undefined,
            })),
            lastUpdated: latestCheck?.checkedAt || undefined,
        });
    }

    return results;
}
