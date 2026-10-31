import { z } from "zod";
import { isClosed } from "../../incident-status";
import { worstDeclared } from "../../provider-status";
import type { FeedContent, FeedReader } from "../read-policy";
import type { PublishedIncident } from "../types";
import { declaredByActiveIncidents, isDormant, type ProblemSeverity } from "./problem-state";
import { statuspageReader, summaryIncidents } from "./statuspage";

/** Os serviços de que sites de terceiros dependem, pelo nome publicado no Feed. Nenhum componente se chama "WAF". */
const CORE_SERVICES = [
    "CDN/Cache",
    "Firewall",
    "Bot Management",
    "Authoritative DNS",
    "Recursive DNS",
    "Network",
    "Workers",
] as const;

/** O grupo que reúne os serviços. Todo componente fora dele é um data center: os outros grupos são regiões. */
const SERVICES_GROUP = "Cloudflare Sites and Services";

type Reach = "core-service" | "other-service" | "data-center";

const incidentImpact = z.enum(["none", "minor", "major", "critical", "maintenance"]);

/** A tabela de classificação de um Incident aberto (spec-declared-severity.md). Sem gravidade, ele não muda o estado. */
const SEVERITY: Record<z.output<typeof incidentImpact>, Partial<Record<Reach, ProblemSeverity>>> = {
    critical: { "core-service": "outage", "other-service": "degraded" },
    major: { "core-service": "outage", "other-service": "degraded" },
    minor: { "core-service": "degraded" },
    none: {},
    maintenance: {},
};

/** Os estados de componente que a Statuspage.io documenta. */
const coreServiceStatus = z.enum(["operational", "under_maintenance", "degraded_performance", "partial_outage", "major_outage"]);

/** Gravidade de um Core Service marcado em falha, sem Incident. Os demais estados não mudam o estado da Cloudflare. */
const CORE_SERVICE_SEVERITY: Partial<Record<z.output<typeof coreServiceStatus>, ProblemSeverity>> = {
    degraded_performance: "degraded",
    partial_outage: "outage",
    major_outage: "outage",
};

const componentFields = { name: z.string(), group_id: z.string().nullish() };

const affectedComponents = z.array(z.object(componentFields)).nullish().transform(components => components ?? []);

/** Só o que este leitor acrescenta ao que a família Statuspage.io já interpreta. O indicador geral não é lido. */
const cloudflareSummarySchema = z.object({
    components: z.array(
        z.object({ ...componentFields, id: z.string(), group: z.boolean().nullish(), status: z.string() }),
    ),
    incidents: z.array(z.object({ id: z.string(), impact: incidentImpact, components: affectedComponents })),
    scheduled_maintenances: z.array(z.object({ id: z.string(), components: affectedComponents })),
});

type CloudflareSummary = z.output<typeof cloudflareSummarySchema>;
type AffectedComponent = CloudflareSummary["incidents"][number]["components"][number];

/** Core Services publicados, com o estado validado. Um deles ausente é conteúdo fora do formato: a regra não pode parar em silêncio. */
function coreServicesOf(components: CloudflareSummary["components"], isService: (c: AffectedComponent) => boolean) {
    const services = components.filter(isService);
    const missing = CORE_SERVICES.filter(name => !services.some(s => s.name === name));
    if (missing.length > 0) throw new Error(`Core Services ausentes do Feed da Cloudflare: ${missing.join(", ")}`);
    return services
        .filter(s => (CORE_SERVICES as readonly string[]).includes(s.name))
        .map(s => ({ name: s.name, status: coreServiceStatus.parse(s.status) }));
}

function toFeedContent(body: string, pollAt: Date): FeedContent {
    const json: unknown = JSON.parse(body);
    const incidents = summaryIncidents(json);
    const summary = cloudflareSummarySchema.parse(json);

    const servicesGroup = summary.components.find(c => c.group && c.name === SERVICES_GROUP);
    if (!servicesGroup) throw new Error(`Grupo "${SERVICES_GROUP}" ausente do Feed da Cloudflare`);

    const isService = (component: AffectedComponent) => component.group_id === servicesGroup.id;
    const coreServices = coreServicesOf(summary.components, isService);
    const isCoreService = (component: AffectedComponent) => isService(component) && coreServices.some(s => s.name === component.name);

    /** Sem componente indicado, o Incident não pode ser descartado: conta como Core Service. */
    const reachOf = (components: AffectedComponent[]): Reach => {
        if (components.length === 0 || components.some(isCoreService)) return "core-service";
        return components.some(isService) ? "other-service" : "data-center";
    };

    const severityOf = new Map(summary.incidents.map(i => [i.id, SEVERITY[i.impact][reachOf(i.components)]]));
    const maintenanceOnService = new Set(summary.scheduled_maintenances.filter(m => reachOf(m.components) !== "data-center").map(m => m.id));
    const changesState = ({ kind, externalId }: PublishedIncident) =>
        kind === "problem" ? severityOf.get(externalId) !== undefined : maintenanceOnService.has(externalId);
    const declaredByIncidents = declaredByActiveIncidents(incidents.filter(changesState), pollAt, problem => severityOf.get(problem.externalId)!);

    // Um Core Service com Incident ativo segue a tabela: o que está marcado nele só conta enquanto o Incident não sai.
    const activeProblems = new Set(incidents.filter(i => i.kind === "problem" && !isClosed(i) && !isDormant(i, pollAt)).map(i => i.externalId));
    const withIncident = summary.incidents.filter(i => activeProblems.has(i.id)).flatMap(i => i.components.filter(isCoreService).map(c => c.name));
    const declaredByCoreServices = coreServices.filter(s => !withIncident.includes(s.name)).flatMap(s => CORE_SERVICE_SEVERITY[s.status] ?? []);

    return { declared: worstDeclared([declaredByIncidents, ...declaredByCoreServices]) ?? "operational", incidents };
}

/**
 * Leitor da Cloudflare (summary.json). O indicador geral não vale: um único data center em falha o faz virar `major`.
 * O estado vem dos Incidents, conforme atinjam ou não um Core Service, e dos Core Services marcados em falha. Quem a
 * tabela diz que não muda o estado fica fora da regra única e continua na lista devolvida ao card.
 */
export const cloudflareReader: FeedReader = {
    addresses: statuspageReader.addresses,
    read: ([body], _addresses, pollAt) => toFeedContent(body, pollAt),
};
