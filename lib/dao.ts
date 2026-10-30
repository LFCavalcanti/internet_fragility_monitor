/**
 * Data Access Object (DAO) Layer
 *
 * This module provides a centralized, secure interface for all database operations.
 * All database access should go through this layer to ensure:
 * - Input validation before database operations (via Zod schemas)
 * - Consistent error handling
 * - Single point of access control
 */
"use server";

import { getDb } from "./db";
import { providers, providerSources, incidents, statusChecks } from "./schema";
import type { Provider, ProviderSource, Incident, NewIncident, StatusCheck, NewStatusCheck } from "./schema";
import { eq, desc, asc, and, notInArray } from "drizzle-orm";
import type { IncidentKind } from "./fetchers/types";
import { CLOSED_STATUSES, closedStatusFor, isClosed, type IncidentStatus } from "./incident-status";
import {
    validate,
    idSchema,
    newStatusCheckSchema,
    incidentSchema,
    createIncidentSchema,
    updateIncidentStatusSchema,
    providerIdParamSchema,
    incidentByTitleParamSchema,
} from "./validation";

// ============================================================================
// Provider Operations
// ============================================================================

// O Provider Catalog só é lido aqui: ele muda por migrations de dados (ADR 0001), nunca pelo código.

/** Providers ativos do Provider Catalog, na ordem de exibição. */
export async function getActiveProviders(): Promise<Provider[]> {
    const db = getDb();
    return await db.select().from(providers)
        .where(eq(providers.active, true))
        .orderBy(asc(providers.displayOrder), asc(providers.id))
        .all();
}

/** Provider Sources ativos dos Providers ativos: o que um Poll lê. Fonte inativa ou de Provider inativo nunca vem. */
export async function getActiveSources(): Promise<ProviderSource[]> {
    const db = getDb();
    const rows = await db.select({ source: providerSources }).from(providerSources)
        .innerJoin(providers, eq(providers.id, providerSources.providerId))
        .where(and(eq(providers.active, true), eq(providerSources.active, true)))
        .orderBy(asc(providerSources.providerId), asc(providerSources.id))
        .all();
    return rows.map(r => r.source);
}

export async function getProviderById(id: string): Promise<Provider | undefined> {
    const validId = validate(idSchema, id, "getProviderById");
    const db = getDb();
    return await db.select().from(providers).where(eq(providers.id, validId)).get();
}

// ============================================================================
// Status Check Operations
// ============================================================================

export async function getLatestStatusCheck(providerId: string): Promise<StatusCheck | undefined> {
    const validId = validate(idSchema, providerId, "getLatestStatusCheck");
    const db = getDb();

    return await db.query.statusChecks.findFirst({
        where: eq(statusChecks.providerId, validId),
        orderBy: [desc(statusChecks.checkedAt)],
    });
}

export async function getGlobalLatestStatusCheck(): Promise<StatusCheck | undefined> {
    const db = getDb();
    return await db.query.statusChecks.findFirst({
        orderBy: [desc(statusChecks.checkedAt)],
    });
}

export async function saveStatusCheck(data: Omit<NewStatusCheck, "id">): Promise<void> {
    const validData = validate(newStatusCheckSchema, data, "saveStatusCheck");

    const db = getDb();
    await db.insert(statusChecks).values({
        ...validData,
        checkedAt: validData.checkedAt || new Date(),
    });
}

// ============================================================================
// Incident Operations
// ============================================================================

/** Incidents abertos do Provider: tudo o que não está encerrado, inclusive manutenção agendada. */
export async function getOpenIncidents(providerId: string): Promise<Incident[]> {
    const { providerId: validId } = validate(providerIdParamSchema, { providerId }, "getOpenIncidents");
    const db = getDb();

    return await db.query.incidents.findMany({
        where: and(
            eq(incidents.providerId, validId),
            notInArray(incidents.status, [...CLOSED_STATUSES])
        ),
        orderBy: [desc(incidents.createdAt)],
    });
}

export async function getAllIncidentsForProvider(providerId: string): Promise<Incident[]> {
    const { providerId: validId } = validate(providerIdParamSchema, { providerId }, "getAllIncidentsForProvider");
    const db = getDb();

    return await db.query.incidents.findMany({
        where: eq(incidents.providerId, validId),
        orderBy: [desc(incidents.createdAt)],
    });
}

export async function getIncidentByTitle(providerId: string, title: string): Promise<Incident | undefined> {
    const validParams = validate(incidentByTitleParamSchema, { providerId, title }, "getIncidentByTitle");

    const db = getDb();
    return await db.query.incidents.findFirst({
        where: and(
            eq(incidents.providerId, validParams.providerId),
            eq(incidents.title, validParams.title)
        ),
    });
}

export async function upsertIncident(data: NewIncident): Promise<void> {
    const validData = validate(incidentSchema, data, "upsertIncident");

    const db = getDb();
    const existing = await db.select().from(incidents).where(eq(incidents.id, validData.id)).get();

    if (!existing) {
        await db.insert(incidents).values({
            ...validData,
            createdAt: validData.createdAt || new Date(),
            updatedAt: new Date(),
        });
    } else {
        await db.update(incidents).set({
            ...validData,
            updatedAt: new Date(),
        }).where(eq(incidents.id, validData.id));
    }
}

export async function createIncident(data: Omit<NewIncident, "id">): Promise<string> {
    const validData = validate(createIncidentSchema, data, "createIncident");

    const id = crypto.randomUUID();
    const db = getDb();

    await db.insert(incidents).values({
        id,
        ...validData,
        createdAt: validData.createdAt || new Date(),
        updatedAt: new Date(),
    });

    return id;
}

export async function updateIncidentStatus(
    id: string,
    status: IncidentStatus,
    description?: string,
    details?: { kind?: IncidentKind; scheduledFor?: Date | null },
): Promise<void> {
    const validData = validate(
        updateIncidentStatusSchema,
        { id, status, description, ...details },
        "updateIncidentStatus",
    );

    const db = getDb();
    await db.update(incidents).set({
        status: validData.status,
        description: validData.description || undefined,
        ...(validData.kind ? { kind: validData.kind } : {}),
        ...(validData.scheduledFor !== undefined ? { scheduledFor: validData.scheduledFor } : {}),
        updatedAt: new Date(),
        // Encerrado marca a hora do encerramento; de volta a uma fase aberta, a hora sai.
        resolvedAt: isClosed(validData) ? new Date() : null,
    }).where(eq(incidents.id, validData.id));
}

/** Encerra um Incident que saiu do Feed: problema vira resolved, manutenção vira completed. */
export async function closeIncident(id: string, kind: IncidentKind): Promise<void> {
    const validId = validate(idSchema, id, "closeIncident");

    const db = getDb();
    await db.update(incidents).set({
        status: closedStatusFor(kind),
        updatedAt: new Date(),
        resolvedAt: new Date(),
    }).where(eq(incidents.id, validId));
}

// Note: All functions are exported individually above.
// "use server" files can only export async functions, not objects.
// Import functions directly: import { getAllProviders, getProviderById, ... } from "./dao";
