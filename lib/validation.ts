/**
 * Zod Validation Schemas
 *
 * Centralized validation schemas for all data types in the application.
 * Use these schemas to validate data before database operations and API boundaries.
 */

import { z } from "zod";

// ============================================================================
// Common Field Schemas
// ============================================================================

/**
 * ID field validation - non-empty string with max length
 */
export const idSchema = z
    .string()
    .min(1, "ID is required")
    .max(255, "ID exceeds maximum length of 255 characters")
    .trim();

/**
 * URL field validation
 */
export const urlSchema = z
    .string()
    .max(2048, "URL exceeds maximum length of 2048 characters")
    .url("Invalid URL format")
    .optional()
    .or(z.literal(""));

/**
 * Optional URL that can be any string (for status page URLs that may not be standard)
 */
export const flexibleUrlSchema = z
    .string()
    .max(2048, "URL exceeds maximum length of 2048 characters")
    .optional();

// ============================================================================
// Provider Schemas
// ============================================================================

export const providerTypeSchema = z.enum(["cloud", "cdn", "paas", "other"]);

export const providerSchema = z.object({
    id: idSchema,
    name: z.string().min(1, "Name is required").max(255, "Name exceeds maximum length").trim(),
    url: z.string().min(1, "URL is required").max(2048, "URL exceeds maximum length"),
    type: z.string().min(1, "Type is required").max(50, "Type exceeds maximum length"),
    logo: z.string().max(2048, "Logo URL exceeds maximum length").optional().nullable(),
});

export const newProviderSchema = providerSchema;

export type ProviderInput = z.infer<typeof providerSchema>;

// ============================================================================
// Status Check Schemas
// ============================================================================

export const statusValueSchema = z.enum(["operational", "degraded", "outage", "unknown"]);

export const statusCheckSchema = z.object({
    id: z.number().int().positive().optional(),
    providerId: idSchema,
    status: statusValueSchema,
    responseTime: z.number().int().nonnegative().optional().nullable(),
    checkedAt: z.date().optional(),
});

export const newStatusCheckSchema = statusCheckSchema.omit({ id: true });

export type StatusCheckInput = z.infer<typeof newStatusCheckSchema>;

// ============================================================================
// Incident Schemas
// ============================================================================

export const incidentStatusSchema = z.enum([
    "investigating",
    "identified",
    "monitoring",
    "resolved",
    "maintenance",
    "scheduled",
]);

export const incidentSeveritySchema = z.enum(["minor", "major", "critical"]).optional().nullable();

export const incidentSchema = z.object({
    id: idSchema,
    providerId: idSchema,
    title: z.string().min(1, "Title is required").max(500, "Title exceeds maximum length").trim(),
    description: z.string().max(5000, "Description exceeds maximum length").optional().nullable(),
    status: z.string().min(1, "Status is required").max(50, "Status exceeds maximum length"),
    severity: z.string().max(20, "Severity exceeds maximum length").optional().nullable(),
    url: flexibleUrlSchema.nullable(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
    resolvedAt: z.date().optional().nullable(),
});

export const newIncidentSchema = incidentSchema.partial({ id: true });

export const createIncidentSchema = incidentSchema.omit({ id: true });

export type IncidentInput = z.infer<typeof incidentSchema>;
export type NewIncidentInput = z.infer<typeof newIncidentSchema>;
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

// ============================================================================
// Update Operation Schemas
// ============================================================================

export const updateIncidentStatusSchema = z.object({
    id: idSchema,
    status: z.string().min(1, "Status is required").max(50, "Status exceeds maximum length"),
    description: z.string().max(5000, "Description exceeds maximum length").optional(),
});

export type UpdateIncidentStatusInput = z.infer<typeof updateIncidentStatusSchema>;

// ============================================================================
// Query Parameter Schemas
// ============================================================================

export const providerIdParamSchema = z.object({
    providerId: idSchema,
});

export const incidentIdParamSchema = z.object({
    id: idSchema,
});

export const incidentByTitleParamSchema = z.object({
    providerId: idSchema,
    title: z.string().min(1, "Title is required").max(500, "Title exceeds maximum length").trim(),
});

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validates data against a Zod schema and returns the parsed result.
 * Throws a formatted error if validation fails.
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown, context?: string): T {
    const result = schema.safeParse(data);

    if (!result.success) {
        // Zod v4 uses issues array instead of errors
        const issues = result.error.issues || [];
        const errors = issues
            .map((e) => 
                `${e.path.length > 0 ? e.path.join(".") + ": " : ""}${e.message}`
            )
            .join("; ");

        throw new Error(`${context ? `[${context}] ` : ""}Validation failed: ${errors}`);
    }

    return result.data;
}

/**
 * Validates data and returns a result object instead of throwing.
 * Useful for form validation where you want to show all errors.
 */
export function safeValidate<T>(
    schema: z.ZodSchema<T>,
    data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
    const result = schema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    return { success: false, errors: result.error };
}
