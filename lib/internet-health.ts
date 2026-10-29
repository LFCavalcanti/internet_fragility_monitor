/**
 * Internet Health: o único lugar que decide o estado da internet como um todo e o destaque do hero.
 * Módulo puro: recebe o resultado de cada Provider, os Major Providers, a hora do último Poll e o relógio.
 * Termos conforme GLOSSARY.md.
 */
import type { IncidentData } from "./fetchers/types";
import type { ProviderStatus } from "./provider-status";

/** Major Providers enquanto o Provider Catalog não existe (o Ticket 07 troca pela marcação no banco). */
export const MAJOR_PROVIDERS: readonly string[] = ["aws", "google-cloud", "azure", "cloudflare"];

export type InternetHealthStatus = "Healthy" | "Unstable" | "Critical";

/** O que o Internet Health precisa saber de um Provider: o estado decidido e os Incidents a exibir. */
export interface ProviderHealthEntry {
    providerId: string;
    name: string;
    logo?: string;
    status: ProviderStatus;
    incidents: IncidentData[];
}

export interface InternetHealthInput {
    providers: ProviderHealthEntry[];
    /** Ids dos Major Providers. */
    majorProviders: readonly string[];
    /** Hora do último Poll; `null` quando nenhum Poll foi registrado. */
    lastPollAt: Date | null;
    /** Relógio: a hora em que o Snapshot é apresentado. */
    now: Date;
}

/** Destaque do hero: um Provider com o Incident principal, ou a menção a vários Providers. */
export interface HeroHighlight {
    type: "down" | "outage" | "degraded";
    title: string;
    providerName: string;
    providerLogo?: string;
    description: string;
}

export interface DecidedInternetHealth {
    status: InternetHealthStatus;
    /** Texto do hero quando não há destaque. */
    description: string;
    highlight?: HeroHighlight;
}

/** Estado neutro de Stale Snapshot: nenhum Internet Health é afirmado, só a hora do último Poll. */
export interface StaleInternetHealth {
    status: "Stale";
    /** Hora do último Poll; `null` quando nenhum Poll foi registrado. */
    lastPollAt: Date | null;
    highlight?: undefined;
}

export type InternetHealth = DecidedInternetHealth | StaleInternetHealth;

/** Texto do estado neutro (árvore de decisões, seção 3). */
export const STALE_TEXT = "Sem leitura recente";

/**
 * Stale Snapshot: mais de três ciclos de Poll de 5 minutos.
 * O Ticket 17 (Poll Schedule) passa a derivar o limite da cadência central.
 */
export const STALE_SNAPSHOT_AFTER_MS = 3 * 5 * 60 * 1000;

/** Texto combinado para Down (árvore de decisões, seção 10). */
export const DOWN_TEXT = "Status page e serviço sem resposta";

/** Down conta como Outage no Internet Health. */
const isSevere = (s: ProviderStatus) => s === "outage" || s === "down";

export function decideInternetHealth({
    providers,
    majorProviders,
    lastPollAt,
    now,
}: InternetHealthInput): InternetHealth {
    // Um Stale Snapshot não pode ser apresentado como o estado atual: vence qualquer faixa, inclusive Critical.
    if (lastPollAt === null || now.getTime() - lastPollAt.getTime() > STALE_SNAPSHOT_AFTER_MS) {
        return { status: "Stale", lastPollAt };
    }

    const severe = providers.filter(p => isSevere(p.status));
    const degraded = providers.filter(p => p.status === "degraded");

    const critical = severe.length >= 2 || severe.some(p => majorProviders.includes(p.providerId));

    if (critical) {
        return {
            status: "Critical",
            description: `${count(severe.length)} reporting a major outage. Internet stability is at risk.`,
            highlight: highlightFor(severe),
        };
    }

    // Sem chegar a Critical, sobra no máximo um Provider em Outage ou Down: ele é o destaque.
    if (severe.length > 0 || degraded.length > 0) {
        const affected = severe.length > 0 ? severe : degraded;
        return {
            status: "Unstable",
            description: `${count(severe.length + degraded.length)} experiencing problems.`,
            highlight: highlightFor(affected),
        };
    }

    return { status: "Healthy", description: "All monitored services are operating normally." };
}

function count(n: number): string {
    return `${n} provider${n === 1 ? " is" : "s are"}`;
}

function highlightFor(affected: ProviderHealthEntry[]): HeroHighlight {
    if (affected.length === 1) {
        const [p] = affected;
        return single(p);
    }

    const type = affected.some(p => p.status === "down")
        ? "down"
        : affected.some(p => p.status === "outage")
          ? "outage"
          : "degraded";
    const names = affected
        .map(p => (p.status === "down" ? `${p.name} (${DOWN_TEXT.toLowerCase()})` : p.name))
        .join(", ");

    return type === "degraded"
        ? {
              type,
              title: "Widespread Instability",
              providerName: "Multiple Providers",
              description: `Degraded service detected in ${names}.`,
          }
        : {
              type,
              title: "Widespread Outage",
              providerName: "Multiple Providers",
              description: `Major outages detected in ${names}.`,
          };
}

function single(p: ProviderHealthEntry): HeroHighlight {
    const base = { providerName: p.name, providerLogo: p.logo };

    if (p.status === "down") {
        // Down não tem Feed lido, então não há Incident a citar.
        return { ...base, type: "down", title: "Service Down", description: DOWN_TEXT };
    }

    const active = p.incidents.find(i => i.kind === "problem" && i.status !== "resolved");

    return p.status === "outage"
        ? { ...base, type: "outage", title: "Service Outage", description: active?.title ?? "Major outage reported." }
        : {
              ...base,
              type: "degraded",
              title: "Service Degraded",
              description: active?.title ?? "Service issues reported.",
          };
}
