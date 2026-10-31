import { z } from "zod";
import type { FeedContent, FeedReader } from "../read-policy";
import type { DeclaredStatus, MaintenancePhase, ProblemStatus, PublishedIncident } from "../types";
import { feedDate } from "./feed-date";
import { withOngoingMaintenance } from "./problem-state";

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

const generalStatusSchema = z.object({ status: z.object({ indicator }) });

const summaryItemsSchema = z.object({
    incidents: z.array(z.object({ ...itemFields, status: problemStatus })),
    scheduled_maintenances: z.array(
        z.object({ ...itemFields, status: maintenancePhase, scheduled_for: feedDate.nullish() }),
    ),
});

type SummaryItems = z.output<typeof summaryItemsSchema>;

function commonFields(item: SummaryItems["incidents"][number] | SummaryItems["scheduled_maintenances"][number]) {
    return {
        externalId: item.id,
        title: item.name,
        description: item.incident_updates?.[0]?.body || item.shortlink || "",
        url: item.shortlink ?? undefined,
        createdAt: item.created_at,
        updatedAt: item.updated_at ?? undefined,
    };
}

/**
 * Os Incidents de um `summary.json`. A classificação vem do próprio Feed: a lista `incidents` traz problemas e a lista
 * `scheduled_maintenances` traz manutenções, cada uma com a fase declarada. Lança com o conteúdo fora do formato.
 */
export function summaryIncidents(summary: unknown): PublishedIncident[] {
    const { incidents, scheduled_maintenances } = summaryItemsSchema.parse(summary);
    const problems = incidents.map(
        (item): PublishedIncident => ({ kind: "problem", status: item.status, ...commonFields(item) }),
    );
    const maintenances = scheduled_maintenances.map(
        (item): PublishedIncident => ({
            kind: "maintenance",
            status: item.status,
            scheduledFor: item.scheduled_for ?? undefined,
            ...commonFields(item),
        }),
    );
    return [...problems, ...maintenances];
}

function toFeedContent(summary: unknown): FeedContent {
    const { status } = generalStatusSchema.parse(summary);
    const incidents = summaryIncidents(summary);
    return { declared: withOngoingMaintenance(INDICATOR_STATUS[status.indicator], incidents), incidents };
}

/** Leitor da família Statuspage.io (summary.json): o estado declarado segue o indicador geral do Provider. */
export const statuspageReader: FeedReader = {
    addresses: catalogUrl => [`${catalogUrl}/api/v2/summary.json`],
    read: ([body]) => toFeedContent(JSON.parse(body)),
};
