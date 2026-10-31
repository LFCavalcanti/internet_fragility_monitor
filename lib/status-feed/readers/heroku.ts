import { z } from "zod";
import type { FeedContent, FeedReader } from "../read-policy";
import type { DeclaredStatus, PublishedIncident } from "../types";
import { feedDate } from "./feed-date";
import { problemPhase } from "./problem-state";

const COLOR_STATUS = {
    green: "operational",
    yellow: "degraded",
    red: "outage",
} as const satisfies Record<string, DeclaredStatus>;

const itemSchema = z.object({
    id: z.number().int(),
    title: z.string().min(1),
    state: z.string().min(1),
    full_url: z.string().nullish(),
    created_at: feedDate,
    updated_at: feedDate.nullish(),
    resolved_at: feedDate.nullish(),
    updates: z.array(z.object({ contents: z.string().nullish(), update_type: z.string().nullish() })).nullish(),
});

const currentStatusSchema = z.object({
    status: z
        .array(z.object({ system: z.string(), status: z.enum(["green", "yellow", "red"]) }))
        .min(1),
    incidents: z.array(itemSchema),
    scheduled: z.array(itemSchema),
});

type CurrentStatus = z.output<typeof currentStatusSchema>;
type Item = CurrentStatus["incidents"][number];

function commonFields(item: Item) {
    return {
        externalId: String(item.id),
        title: item.title,
        description: item.updates?.[0]?.contents ?? undefined,
        url: item.full_url ?? undefined,
        createdAt: item.created_at,
        updatedAt: item.updated_at ?? undefined,
    };
}

function toProblem(item: Item): PublishedIncident {
    const resolved = item.state === "resolved";
    return {
        ...commonFields(item),
        kind: "problem",
        status: problemPhase(resolved),
        resolvedAt: resolved ? item.resolved_at ?? undefined : undefined,
    };
}

/**
 * O Feed deixa manutenções passadas na lista com `state: "upcoming"`. O que fecha uma delas é a atualização do tipo
 * `resolved`. `created_at` é o início marcado: passado, a manutenção sai da Upcoming Maintenance.
 */
function toMaintenance(item: Item): PublishedIncident {
    const finished = item.state === "resolved" || item.updates?.some(u => u.update_type === "resolved");
    return finished
        ? { ...commonFields(item), kind: "maintenance", status: "completed", resolvedAt: item.resolved_at ?? undefined }
        : { ...commonFields(item), kind: "maintenance", status: "scheduled", scheduledFor: item.created_at };
}

/** O pior estado entre os sistemas: um problema em Data ou Tools é um problema declarado, mesmo com Apps verde. */
function declaredStatus(systems: CurrentStatus["status"]): DeclaredStatus {
    const declared = systems.map(s => COLOR_STATUS[s.status]);
    return (["outage", "degraded"] as const).find(s => declared.includes(s)) ?? "operational";
}

function toFeedContent(current: CurrentStatus): FeedContent {
    return {
        declared: declaredStatus(current.status),
        incidents: [...current.incidents.map(toProblem), ...current.scheduled.map(toMaintenance)],
    };
}

/**
 * Leitor da Heroku (current-status). A classificação vem do Feed: `incidents` traz problemas e `scheduled` traz
 * manutenções. A fase de um problema não vem numa lista fechada (`open` em andamento, `resolved` no fim).
 */
export const herokuReader: FeedReader = {
    read: ([body]) => toFeedContent(currentStatusSchema.parse(JSON.parse(body))),
};
