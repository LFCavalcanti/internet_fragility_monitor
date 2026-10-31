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
    /** Cadência dos Polls; sem ela, vale a da política de Poll Schedule. */
    cadenceMs?: number;
}

/** Destaque do hero: um Provider com o Incident principal, ou a menção a vários Providers. */
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
    /** Texto do hero quando não há destaque. */
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

/** Texto do estado neutro (árvore de decisões, seção 3). */
export const STALE_TEXT = "Sem leitura recente";

/** Texto combinado para Down (árvore de decisões, seção 10). */
export const DOWN_TEXT = "Status page e serviço sem resposta";

/** Down conta como Outage no Internet Health. */
const isSevere = (s: ProviderStatus) => s === "outage" || s === "down";

export function decideInternetHealth({
    providers,
    lastPollAt,
    now,
    cadenceMs,
}: InternetHealthInput): HeroState {
    // Um Stale Snapshot não pode ser apresentado como o estado atual: vence qualquer faixa, inclusive Critical.
    if (isStaleSnapshot(lastPollAt, now, cadenceMs)) {
        return { status: "Stale", lastPollAt };
    }

    const severe = providers.filter(p => isSevere(p.decision.status));
    const degraded = providers.filter(p => p.decision.status === "degraded");

    const critical = severe.length >= 2 || severe.some(p => p.provider.isMajor);

    if (critical) {
        return {
            status: "Critical",
            description: `${providersPhrase(severe.length)} reporting a major outage. Internet stability is at risk.`,
            highlight: highlightFor(severe),
        };
    }

    // Sem chegar a Critical, sobra no máximo um Provider em Outage ou Down: ele é o destaque.
    if (severe.length > 0 || degraded.length > 0) {
        const affected = severe.length > 0 ? severe : degraded;
        return {
            status: "Unstable",
            description: `${providersPhrase(severe.length + degraded.length)} experiencing problems.`,
            highlight: highlightFor(affected),
        };
    }

    return { status: "Healthy", description: "All monitored services are operating normally." };
}

function providersPhrase(n: number): string {
    return `${n} provider${n === 1 ? " is" : "s are"}`;
}

function highlightFor(affected: ProviderHealthEntry[]): HeroHighlight {
    if (affected.length === 1) {
        const [p] = affected;
        return singleHighlight(p);
    }

    const type = affected.some(p => p.decision.status === "down")
        ? "down"
        : affected.some(p => p.decision.status === "outage")
          ? "outage"
          : "degraded";
    const names = affected
        .map(({ provider, decision }) =>
            decision.status === "down" ? `${provider.name} (${DOWN_TEXT.toLowerCase()})` : provider.name,
        )
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

function singleHighlight({ provider, decision }: ProviderHealthEntry): HeroHighlight {
    const base = { providerName: provider.name, providerLogo: provider.logo };

    if (decision.status === "down") {
        // Down não tem Feed lido, então não há Incident a citar.
        return { ...base, type: "down", title: "Service Down", description: DOWN_TEXT };
    }

    const active = decision.incidents.find(i => i.kind === "problem" && !isClosed(i));

    return decision.status === "outage"
        ? { ...base, type: "outage", title: "Service Outage", description: active?.title ?? "Major outage reported." }
        : {
              ...base,
              type: "degraded",
              title: "Service Degraded",
              description: active?.title ?? "Service issues reported.",
          };
}
