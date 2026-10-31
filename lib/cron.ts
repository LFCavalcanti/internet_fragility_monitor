import cron from "node-cron";
import type { Database } from "./db";
import { runPoll } from "./poll";
import { readSnapshot } from "./poll-recording";
import { createPollSchedule, type PollSchedule } from "./poll-schedule";

const MINUTE_MS = 60 * 1000;

/**
 * A expressão do `node-cron` para uma cadência. O campo de minutos só repete por igual dentro da hora se o ciclo
 * for um divisor de 60: com 7 minutos, dispararia aos 56 e de novo aos 0, 4 minutos depois.
 */
export function cronExpressionFor(cadenceMs: number): string {
    const minutes = cadenceMs / MINUTE_MS;
    if (!Number.isInteger(minutes) || minutes >= 60 || 60 % minutes !== 0) {
        throw new Error(`Cadência de ${cadenceMs} ms não cabe numa expressão do node-cron: use um divisor de 60 minutos.`);
    }
    return `*/${minutes} * * * *`;
}

/**
 * O agendamento do processo. Fica no módulo porque só a instrumentação importa este arquivo, e o Next chama
 * `register` uma vez por servidor: o bundle das páginas não tem uma segunda cópia que possa agendar de novo.
 */
let pollSchedule: PollSchedule | undefined;

/** Adaptador da política de Poll Schedule: o `node-cron` só dispara, e a política decide. */
export function initCron(db: Database): Promise<void> {
    pollSchedule ??= createPollSchedule({
        clock: () => new Date(),
        schedule: (cadenceMs, fire) => {
            cron.schedule(cronExpressionFor(cadenceMs), fire);
        },
        poll: () => runPoll(db),
        readLastPollAt: async () => (await readSnapshot(db, new Date())).lastPollAt,
    });

    return pollSchedule.start();
}
