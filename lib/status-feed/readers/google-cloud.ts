import { z } from "zod";
import { isClosed } from "../../incident-status";
import type { FeedContent, FeedReader, PublishedIncident } from "../read-policy";
import { feedDate } from "./feed-date";

const incidentsSchema = z.array(
    z.object({
        id: z.string().min(1),
        service_name: z.string().min(1),
        external_desc: z.string().min(1),
        begin: feedDate,
        end: feedDate.nullish(),
        modified: feedDate.nullish(),
        uri: z.string().nullish(),
        updates: z.array(z.object({ text: z.string().nullish() })).nullish(),
    }),
);

type GoogleIncident = z.output<typeof incidentsSchema>[number];

function toIncident(incident: GoogleIncident, address: string): PublishedIncident {
    return {
        kind: "problem",
        status: incident.end ? "resolved" : "investigating",
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

function toFeedContent(incidents: GoogleIncident[], address: string): FeedContent {
    const published = incidents.map(incident => toIncident(incident, address));
    return { declared: published.some(i => !isClosed(i)) ? "degraded" : "operational", incidents: published };
}

/** Leitor do Google Cloud (incidents.json): a lista traz também os encerrados, com a hora de fim em `end`. */
export const googleCloudReader: FeedReader = {
    read: (body, address) => toFeedContent(incidentsSchema.parse(JSON.parse(body)), address),
};
