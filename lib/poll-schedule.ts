/**
 * Política de Poll Schedule: o único lugar da cadência dos Polls, do limite de Stale Snapshot,
 * da regra de rodar ao iniciar e da exclusão mútua entre Polls.
 * Módulo puro, importado por módulos que chegam ao navegador: não pode importar `node-cron` nem o banco.
 * Termos conforme GLOSSARY.md.
 */

/** Cadência dos Polls: o ciclo. A página e o agendador leem este valor. Precisa ser um divisor de 60 minutos (`lib/cron.ts`). */
export const POLL_CADENCE_MS = 5 * 60 * 1000;

/** Um Snapshot fica Stale depois de mais de três ciclos de Poll. */
const STALE_SNAPSHOT_CYCLES = 3;

/** Stale Snapshot: o último Poll tem mais de três ciclos ou não existe, e não há leitura recente a apresentar. */
export function isStaleSnapshot(lastPollAt: Date | null, now: Date, cadenceMs = POLL_CADENCE_MS): boolean {
    return lastPollAt === null || now.getTime() - lastPollAt.getTime() > STALE_SNAPSHOT_CYCLES * cadenceMs;
}

export interface PollScheduleDeps {
    /** Relógio. */
    clock: () => Date;
    /** A forma de disparar: chama `fire` a cada `cadenceMs`. */
    schedule: (cadenceMs: number, fire: () => Promise<void>) => void;
    /** A operação de Poll. */
    poll: () => Promise<void>;
    /** Hora do último Poll; `null` quando nenhum Poll foi registrado. */
    readLastPollAt: () => Promise<Date | null>;
    /** Cadência; só um teste precisa de outra. */
    cadenceMs?: number;
}

export interface PollSchedule {
    /** Decide o Poll da inicialização e agenda os disparos. */
    start: () => Promise<void>;
}

export function createPollSchedule({
    clock,
    schedule,
    poll,
    readLastPollAt,
    cadenceMs = POLL_CADENCE_MS,
}: PollScheduleDeps): PollSchedule {
    /** Ao iniciar, roda um Poll se o último tiver mais de um ciclo ou não existir, ou se não der para saber. */
    async function isPollDueOnStart(): Promise<boolean> {
        try {
            const lastPollAt = await readLastPollAt();
            if (lastPollAt === null || clock().getTime() - lastPollAt.getTime() > cadenceMs) {
                console.log("Last Poll is older than one cycle (or none). Triggering immediate Poll...");
                return true;
            }
            console.log(`Data is fresh (last Poll at ${lastPollAt.toISOString()}). Skipping immediate Poll.`);
            return false;
        } catch (error) {
            console.error("Error checking last Poll time:", error);
            return true;
        }
    }

    /** Marca de inicialização: o agendamento só é criado uma vez. */
    let started = false;
    /** Marca de Poll em andamento, com a hora em que ele começou; `null` quando não há nenhum. */
    let pollStartedAt: Date | null = null;

    /** Exclusão mútua: nunca dois Polls ao mesmo tempo, sem fila. Nunca rejeita, e todo fim de Poll libera a marca. */
    async function runExclusive(): Promise<void> {
        if (pollStartedAt !== null) {
            console.warn(`Disparo pulado: Poll em andamento desde ${pollStartedAt.toISOString()}.`);
            return;
        }

        pollStartedAt = clock();
        try {
            await poll();
        } catch (error) {
            console.error("Poll falhou:", error);
        } finally {
            pollStartedAt = null;
        }
    }

    return {
        async start() {
            if (started) return;
            started = true;

            const pollNow = await isPollDueOnStart();

            // Agenda antes do Poll da inicialização, no mesmo passo em que ele toma a marca: um disparo não cai
            // entre os dois, e um disparo durante esse Poll é pulado como qualquer outro.
            schedule(cadenceMs, runExclusive);
            if (pollNow) await runExclusive();
        },
    };
}
