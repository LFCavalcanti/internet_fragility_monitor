/**
 * Internet Health: o único lugar que decide o estado da internet como um todo e o destaque do hero.
 * Módulo puro: recebe cada Provider do Snapshot com o estado decidido, a hora do último Poll e o relógio.
 * Termos conforme GLOSSARY.md.
 */
import type { ProviderStatus, ProviderStatusDecision } from "./provider-status";
import type { SnapshotProvider } from "./poll-recording";
import { isClosed } from "./incident-status";
import { isStaleSnapshot } from "./poll-schedule";

export type InternetHealthStatus = "Healthy" | "Unstable" | "Critical";

/**
 * O que o Internet Health precisa de um Provider do Snapshot: nome, logo e a marca de Major Provider do catálogo,
 * e o estado e os Incidents decididos pelo módulo de Provider Status.
 */
export interface ProviderHealthEntry {
    provider: Pick<SnapshotProvider, "name" | "logo" | "isMajor">;
    decision: Pick<ProviderStatusDecision, "status" | "incidents">;
}

export interface InternetHealthInput {
    providers: ProviderHealthEntry[];
    /** Hora do último Poll; `null` quando nenhum Poll foi registrado. */
    lastPollAt: Date | null;
    /** Relógio: a hora em que o Snapshot é apresentado. */
    now: Date;
}

/** Destaque do hero, abaixo do texto: um Provider com o Incident principal, ou a menção a vários Providers. */
export interface HeroHighlight {
    type: "down" | "outage" | "degraded";
    title: string;
    providerName: string;
    providerLogo?: string;
    description: string;
}

/** Internet Health: Healthy, Unstable ou Critical, com o texto e o destaque do hero. */
export interface InternetHealth {
    status: InternetHealthStatus;
    /** Texto do hero. */
    description: string;
    highlight?: HeroHighlight;
}

/** Estado neutro de Stale Snapshot: nenhum Internet Health é afirmado, só a hora do último Poll. */
export interface StaleSnapshotState {
    status: "Stale";
    /** Hora do último Poll; `null` quando nenhum Poll foi registrado. */
    lastPollAt: Date | null;
}

/** O que o hero mostra: o Internet Health, ou o estado neutro de Stale Snapshot. */
export type HeroState = InternetHealth | StaleSnapshotState;

/** Texto do estado neutro. */
export const STALE_TEXT = "No recent reading";

/** Texto combinado para Down. */
export const DOWN_TEXT = "Status page and service not responding";

/** Down conta como Outage no Internet Health. */
const isSevere = (s: ProviderStatus) => s === "outage" || s === "down";

/** Quantos Providers quaisquer em Outage ou Down, ao mesmo tempo, formam uma Major Outage. */
const MAJOR_OUTAGE_PROVIDERS = 3;

/** Major Outage: a única conta de Critical. Recebe só os Providers em Outage ou Down. */
const isMajorOutage = (severe: ProviderHealthEntry[]) =>
    severe.length >= MAJOR_OUTAGE_PROVIDERS || severe.some(p => p.provider.isMajor);

export function decideInternetHealth({
    providers,
    lastPollAt,
    now,
}: InternetHealthInput): HeroState {
    // Um Stale Snapshot não pode ser apresentado como o estado atual: vence qualquer faixa, inclusive Critical.
    if (isStaleSnapshot(lastPollAt, now)) {
        return { status: "Stale", lastPollAt };
    }

    const severe = providers.filter(p => isSevere(p.decision.status));
    const degraded = providers.filter(p => p.decision.status === "degraded");

    if (isMajorOutage(severe)) {
        const [only] = severe;
        return {
            status: "Critical",
            description: `Major outage ${severe.length === 1 ? `at ${only.provider.name}` : `across ${severe.length} providers`}. Internet stability is at risk.`,
            highlight:
                severe.length === 1
                    ? { ...singleHighlight(only), title: "Major Outage" }
                    : outagesHighlight(severe, "Widespread Outage"),
        };
    }

    if (severe.length > 0 || degraded.length > 0) {
        return {
            status: "Unstable",
            description: `${providersPhrase(severe.length + degraded.length)} experiencing problems.`,
            highlight: unstableHighlight(severe, degraded),
        };
    }

    return { status: "Healthy", description: "All monitored services are operating normally." };
}

function providersPhrase(n: number): string {
    return `${n} provider${n === 1 ? " is" : "s are"}`;
}

/** O destaque de Unstable prioriza Outage e Down sobre Degraded. */
function unstableHighlight(severe: ProviderHealthEntry[], degraded: ProviderHealthEntry[]): HeroHighlight {
    const affected = severe.length > 0 ? severe : degraded;

    if (affected.length === 1) {
        return singleHighlight(affected[0]);
    }

    return severe.length > 0
        ? outagesHighlight(severe, "Multiple Outages")
        : {
              type: "degraded",
              title: "Widespread Instability",
              providerName: "Multiple Providers",
              description: `Degraded service detected in ${degraded.map(p => p.provider.name).join(", ")}.`,
          };
}

function outagesHighlight(severe: ProviderHealthEntry[], title: string): HeroHighlight {
    const names = severe
        .map(({ provider, decision }) =>
            decision.status === "down" ? `${provider.name} (${DOWN_TEXT.toLowerCase()})` : provider.name,
        )
        .join(", ");

    return {
        type: severe.some(p => p.decision.status === "down") ? "down" : "outage",
        title,
        providerName: "Multiple Providers",
        description: `Outages detected in ${names}.`,
    };
}

function singleHighlight({ provider, decision }: ProviderHealthEntry): HeroHighlight {
    const base = { providerName: provider.name, providerLogo: provider.logo };

    if (decision.status === "down") {
        // Down não tem Feed lido, então não há Incident a citar.
        return { ...base, type: "down", title: "Provider Down", description: DOWN_TEXT };
    }

    const active = decision.incidents.find(i => i.kind === "problem" && !isClosed(i));

    return decision.status === "outage"
        ? { ...base, type: "outage", title: "Provider Outage", description: active?.title ?? "Outage reported." }
        : {
              ...base,
              type: "degraded",
              title: "Provider Degraded",
              description: active?.title ?? "Service issues reported.",
          };
}
