import { z } from "zod";
import type { FeedContent, FeedReader } from "../read-policy";
import type { PublishedIncident } from "../types";
import { feedDate } from "./feed-date";
import { declaredByActiveIncidents, problemPhase } from "./problem-state";

const incidentsSchema = z.array(
    z.object({
        id: z.string().min(1),
        service_name: z.string().min(1),
        external_desc: z.string().min(1),
        begin: feedDate,
        end: feedDate.nullish(),
        modified: feedDate.nullish(),
        uri: z.string().nullish(),
        status_impact: z.string().nullish(),
        updates: z.array(z.object({ text: z.string().nullish() })).nullish(),
    }),
);

type GoogleIncident = z.output<typeof incidentsSchema>[number];

function toIncident(incident: GoogleIncident, address: string): PublishedIncident {
    return {
        kind: "problem",
        status: problemPhase(Boolean(incident.end)),
        externalId: incident.id,
        title: `${incident.service_name}: ${incident.external_desc}`,
        description: incident.updates?.[0]?.text || incident.external_desc,
        // O Feed publica o link relativo à própria status page.
        url: incident.uri ? new URL(incident.uri, address).href : undefined,
        createdAt: incident.begin,
        updatedAt: incident.modified ?? undefined,
        resolvedAt: incident.end ?? undefined,
    };
}

function toFeedContent(incidents: GoogleIncident[], address: string, pollAt: Date): FeedContent {
    const published = incidents.map(incident => toIncident(incident, address));
    // Só `SERVICE_OUTAGE` é Outage: qualquer outro valor, inclusive um novo, é Degraded.
    const outages = new Set(incidents.filter(incident => incident.status_impact === "SERVICE_OUTAGE").map(incident => incident.id));
    const declared = declaredByActiveIncidents(published, pollAt, problem => (outages.has(problem.externalId) ? "outage" : "degraded"));
    return { declared, incidents: published };
}

/** Leitor do Google Cloud (incidents.json): a lista traz também os encerrados, com a hora de fim em `end`. */
export const googleCloudReader: FeedReader = {
    read: ([body], [address], pollAt) => toFeedContent(incidentsSchema.parse(JSON.parse(body)), address, pollAt),
};
