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
import { providers, incidents, statusChecks } from "./schema";
import type { Provider, NewProvider, Incident, NewIncident, StatusCheck, NewStatusCheck } from "./schema";
import { eq, desc, and, ne } from "drizzle-orm";
import {
    validate,
    idSchema,
    providerSchema,
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

export async function getAllProviders(): Promise<Provider[]> {
    const db = getDb();
    return await db.select().from(providers).all();
}

export async function getProviderById(id: string): Promise<Provider | undefined> {
    const validId = validate(idSchema, id, "getProviderById");
    const db = getDb();
    return await db.select().from(providers).where(eq(providers.id, validId)).get();
}

export async function upsertProvider(data: NewProvider): Promise<void> {
    const validData = validate(providerSchema, data, "upsertProvider");

    const db = getDb();
    const existing = await db.select().from(providers).where(eq(providers.id, validData.id)).get();

    if (!existing) {
        await db.insert(providers).values(validData);
    } else {
        await db.update(providers).set(validData).where(eq(providers.id, validData.id));
    }
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

export async function getActiveIncidents(providerId: string): Promise<Incident[]> {
    const { providerId: validId } = validate(providerIdParamSchema, { providerId }, "getActiveIncidents");
    const db = getDb();

    return await db.query.incidents.findMany({
        where: and(
            eq(incidents.providerId, validId),
            ne(incidents.status, "resolved")
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

export async function updateIncidentStatus(id: string, status: string, description?: string): Promise<void> {
    const validData = validate(updateIncidentStatusSchema, { id, status, description }, "updateIncidentStatus");

    const db = getDb();
    await db.update(incidents).set({
        status: validData.status,
        description: validData.description || undefined,
        updatedAt: new Date(),
        ...(validData.status === "resolved" ? { resolvedAt: new Date() } : {}),
    }).where(eq(incidents.id, validData.id));
}

export async function resolveIncident(id: string): Promise<void> {
    const validId = validate(idSchema, id, "resolveIncident");

    const db = getDb();
    await db.update(incidents).set({
        status: "resolved",
        updatedAt: new Date(),
        resolvedAt: new Date(),
    }).where(eq(incidents.id, validId));
}

// Note: All functions are exported individually above.
// "use server" files can only export async functions, not objects.
// Import functions directly: import { getAllProviders, getProviderById, ... } from "./dao";
