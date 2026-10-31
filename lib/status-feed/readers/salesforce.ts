import { z } from "zod";
import type { FeedContent, FeedReader } from "../read-policy";
import type { MaintenancePhase, PublishedIncident } from "../types";
import { feedDate } from "./feed-date";
import { declaredByActiveIncidents, problemPhase } from "./problem-state";

/**
 * O Feed guarda cerca de 18 mil manutenções, uma por instância, entre 30 dias atrás e um ano à frente, e entrega no
 * máximo 1000 por pedido, fora de ordem: sem filtro, a manutenção em andamento fica de fora. O pedido começa três
 * dias atrás, porque quase toda manutenção dura até 55 h (coleta de 31/10/2026) e o filtro só olha a data de início.
 * Num fim de semana de release a lista passa do limite, e o que vem depois dele não é lido: isso vai ao log.
 */
const MAINTENANCE_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const MAINTENANCE_LIMIT = 1000;

/** Os dois valores que `/incidents/impactTypes` publica. */
const severity = z.enum(["minor", "major"]);

const incidentsSchema = z.array(
    z.object({
        id: z.number().int(),
        type: z.string().min(1),
        createdAt: feedDate,
        updatedAt: feedDate.nullish(),
        IncidentImpacts: z.array(z.object({ severity, endTime: feedDate.nullish() })),
        IncidentEvents: z.array(z.object({ message: z.string().nullish(), createdAt: feedDate })),
    }),
);

/** A lista não é publicada: estes são todos os valores das 18.031 manutenções da coleta de 31/10/2026. */
const maintenanceStatus = z.enum(["Confirmed", "Active", "Resolved", "Canceled", "Rescheduled"]);

const maintenancesSchema = z.array(
    z.object({
        id: z.number().int(),
        name: z.string().min(1),
        status: maintenanceStatus,
        plannedStartTime: feedDate.nullish(),
        additionalInformation: z.string().nullish(),
        createdAt: feedDate,
        updatedAt: feedDate.nullish(),
        MaintenanceImpacts: z.array(z.object({ endTime: feedDate.nullish() })),
    }),
);

type Incident = z.output<typeof incidentsSchema>[number];
type Maintenance = z.output<typeof maintenancesSchema>[number];
type MaintenanceStatus = z.output<typeof maintenanceStatus>;

/**
 * Cancelada ou remarcada não vai acontecer, então não é lida. `Confirmed` continua assim depois da data marcada: a
 * manutenção fica `scheduled`, e com data passada não conta como em andamento nem como Upcoming Maintenance.
 */
const MAINTENANCE_PHASE: Partial<Record<MaintenanceStatus, MaintenancePhase>> = {
    Confirmed: "scheduled",
    Active: "in_progress",
    Resolved: "completed",
};

const newestFirst = (a: Date, b: Date) => b.getTime() - a.getTime();

function toProblem(incident: Incident): PublishedIncident {
    const [latest] = [...incident.IncidentEvents].sort((a, b) => newestFirst(a.createdAt, b.createdAt));
    return {
        kind: "problem",
        status: problemPhase(false),
        externalId: String(incident.id),
        // O Feed não publica título. O id mantém o título igual enquanto o Incident muda; `type` é Degradation ou Disruption.
        title: `${incident.type} #${incident.id}`,
        description: latest?.message ?? undefined,
        createdAt: incident.createdAt,
        updatedAt: incident.updatedAt ?? undefined,
    };
}

/** A hora em que o último impacto da manutenção terminou. */
function endOf(maintenance: Maintenance): Date | undefined {
    const ends = maintenance.MaintenanceImpacts.flatMap(i => i.endTime ?? []);
    return ends.sort(newestFirst)[0] ?? maintenance.updatedAt ?? undefined;
}

function toMaintenance(maintenance: Maintenance): PublishedIncident[] {
    const phase = MAINTENANCE_PHASE[maintenance.status];
    if (!phase) return [];

    return [
        {
            kind: "maintenance",
            status: phase,
            externalId: String(maintenance.id),
            title: maintenance.name,
            description: maintenance.additionalInformation || undefined,
            scheduledFor: maintenance.plannedStartTime ?? undefined,
            createdAt: maintenance.createdAt,
            updatedAt: maintenance.updatedAt ?? undefined,
            resolvedAt: phase === "completed" ? endOf(maintenance) : undefined,
        },
    ];
}

/** Um impacto `major` aberto é Outage. Incidente ativo sem impacto aberto continua sendo problema parcial. */
function hasOpenMajorImpact(incident: Incident): boolean {
    return incident.IncidentImpacts.some(impact => !impact.endTime && impact.severity === "major");
}

function toFeedContent(incidents: Incident[], maintenances: Maintenance[], pollAt: Date): FeedContent {
    if (maintenances.length >= MAINTENANCE_LIMIT) {
        console.warn(`Feed da Salesforce: a lista de manutenções parou no limite de ${MAINTENANCE_LIMIT} itens; as seguintes não foram lidas.`);
    }

    const published = [...incidents.map(toProblem), ...maintenances.flatMap(toMaintenance)];
    const outages = new Set(incidents.filter(hasOpenMajorImpact).map(incident => String(incident.id)));
    const declared = declaredByActiveIncidents(published, pollAt, problem => (outages.has(problem.externalId) ? "outage" : "degraded"));
    return { declared, incidents: published };
}

/**
 * Leitor da família Salesforce. A URL do catálogo é a raiz do Feed, que são duas listas: a classificação vem da
 * lista em que o item está. Os incidentes vêm só de `/incidents/active`: quem sai dela foi encerrado.
 */
export const salesforceReader: FeedReader = {
    addresses: (catalogUrl, pollAt) => {
        const query = new URLSearchParams({
            startTime: new Date(pollAt.getTime() - MAINTENANCE_LOOKBACK_MS).toISOString(),
            sort: "plannedStartTime",
            order: "ASC",
            limit: String(MAINTENANCE_LIMIT),
        });
        return [`${catalogUrl}/incidents/active`, `${catalogUrl}/maintenances?${query}`];
    },
    read: ([incidents, maintenances], _addresses, pollAt) =>
        toFeedContent(incidentsSchema.parse(JSON.parse(incidents)), maintenancesSchema.parse(JSON.parse(maintenances)), pollAt),
};
