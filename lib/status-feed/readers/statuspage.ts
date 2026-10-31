import { z } from "zod";
import type { FeedContent, FeedReader } from "../read-policy";
import type { DeclaredStatus, MaintenancePhase, ProblemStatus, PublishedIncident } from "../types";
import { feedDate } from "./feed-date";

/** "maintenance" não conta aqui: Maintenance vem das manutenções em andamento, não do indicador. */
const INDICATOR_STATUS = {
    none: "operational",
    maintenance: "operational",
    minor: "degraded",
    major: "outage",
    critical: "outage",
} as const satisfies Record<string, DeclaredStatus>;

const indicator = z.enum(["none", "maintenance", "minor", "major", "critical"]);

const problemStatus = z
    .enum(["investigating", "identified", "monitoring", "resolved", "postmortem"])
    .transform((status): ProblemStatus => (status === "postmortem" ? "resolved" : status));

const maintenancePhase = z
    .enum(["scheduled", "in_progress", "verifying", "completed"])
    .transform((phase): MaintenancePhase => (phase === "verifying" ? "in_progress" : phase));

/** Campos comuns aos itens das listas `incidents` e `scheduled_maintenances` (só os lidos). */
const itemFields = {
    id: z.string().min(1),
    name: z.string().min(1),
    shortlink: z.string().nullish(),
    created_at: feedDate,
    updated_at: feedDate.nullish(),
    incident_updates: z.array(z.object({ body: z.string().nullish() })).nullish(),
};

const summarySchema = z.object({
    status: z.object({ indicator }),
    incidents: z.array(z.object({ ...itemFields, status: problemStatus })),
    scheduled_maintenances: z.array(
        z.object({ ...itemFields, status: maintenancePhase, scheduled_for: feedDate.nullish() }),
    ),
});

type Summary = z.output<typeof summarySchema>;

function commonFields(item: Summary["incidents"][number] | Summary["scheduled_maintenances"][number]) {
    return {
        externalId: item.id,
        title: item.name,
        description: item.incident_updates?.[0]?.body || item.shortlink || "",
        url: item.shortlink ?? undefined,
        createdAt: item.created_at,
        updatedAt: item.updated_at ?? undefined,
    };
}

function toFeedContent(summary: Summary): FeedContent {
    const problems = summary.incidents.map(
        (item): PublishedIncident => ({ kind: "problem", status: item.status, ...commonFields(item) }),
    );
    const maintenances = summary.scheduled_maintenances.map(
        (item): PublishedIncident => ({
            kind: "maintenance",
            status: item.status,
            scheduledFor: item.scheduled_for ?? undefined,
            ...commonFields(item),
        }),
    );

    return { declared: INDICATOR_STATUS[summary.status.indicator], incidents: [...problems, ...maintenances] };
}

/**
 * Leitor da família Statuspage.io (summary.json).
 * A classificação vem do próprio Feed: a lista `incidents` traz problemas e a lista
 * `scheduled_maintenances` traz manutenções, cada uma com a fase declarada.
 */
export const statuspageReader: FeedReader = {
    addresses: catalogUrl => [`${catalogUrl}/api/v2/summary.json`],
    read: ([body]) => toFeedContent(summarySchema.parse(JSON.parse(body))),
};
