// @vitest-environment node
/**
 * Política de Poll Schedule com relógio, disparo e operação de Poll falsos, sem `node-cron` e sem esperar minutos reais.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POLL_CADENCE_MS, createPollSchedule, isStaleSnapshot, type PollScheduleDeps } from '@/lib/poll-schedule';

const MINUTE = 60 * 1000;
const START = new Date('2026-10-31T12:02:00Z');

const minutesBefore = (date: Date, minutes: number) => new Date(date.getTime() - minutes * MINUTE);

/** Política com tudo falso: `now` é o relógio, `fire` é o disparo agendado e `polls` conta as operações de Poll. */
function harness(overrides: Partial<PollScheduleDeps> = {}) {
    const state = {
        now: START,
        polls: 0,
        schedules: [] as { cadenceMs: number; fire: () => Promise<void> }[],
    };

    const policy = createPollSchedule({
        clock: () => state.now,
        schedule: (cadenceMs, fire) => {
            state.schedules.push({ cadenceMs, fire });
        },
        poll: async () => {
            state.polls += 1;
        },
        readLastPollAt: async () => minutesBefore(START, 1),
        ...overrides,
    });

    return { policy, state, fire: () => state.schedules[0].fire() };
}

const lastPollMinutesAgo = (minutes: number) => ({
    readLastPollAt: async () => minutesBefore(START, minutes),
});

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ao iniciar', () => {
    it('roda um Poll com o último de 6 minutos atrás', async () => {
        const { policy, state } = harness(lastPollMinutesAgo(6));

        await policy.start();

        expect(state.polls).toBe(1);
    });

    it('não roda um Poll com o último de 4 minutos atrás', async () => {
        const { policy, state } = harness(lastPollMinutesAgo(4));

        await policy.start();

        expect(state.polls).toBe(0);
    });

    it('não roda um Poll com o último a exatamente um ciclo: só mais de um ciclo conta', async () => {
        const { policy, state } = harness(lastPollMinutesAgo(5));

        await policy.start();

        expect(state.polls).toBe(0);
    });

    it('roda um Poll quando não há último Poll', async () => {
        const { policy, state } = harness({ readLastPollAt: async () => null });

        await policy.start();

        expect(state.polls).toBe(1);
    });

    it('roda um Poll e registra no log quando a consulta da hora falha', async () => {
        const failure = new Error('banco fora do ar');
        const { policy, state } = harness({ readLastPollAt: () => Promise.reject(failure) });

        await policy.start();

        expect(state.polls).toBe(1);
        expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
    });

    it('a regra acompanha a cadência: com ciclo de 10 minutos, o último de 6 minutos ainda é recente', async () => {
        const { policy, state } = harness({ ...lastPollMinutesAgo(6), cadenceMs: 10 * MINUTE });

        await policy.start();

        expect(state.polls).toBe(0);
    });

    it('agenda na cadência da política, com ou sem Poll na hora', async () => {
        const recent = harness(lastPollMinutesAgo(1));
        const old = harness({ ...lastPollMinutesAgo(30), cadenceMs: 10 * MINUTE });

        await recent.policy.start();
        await old.policy.start();

        expect(recent.state.schedules.map(s => s.cadenceMs)).toEqual([5 * MINUTE]);
        expect(old.state.schedules.map(s => s.cadenceMs)).toEqual([10 * MINUTE]);
    });
});

/** Uma operação de Poll que só termina quando o teste manda, e registra quantas vezes foi chamada. */
function controlledPoll() {
    const finishers: { resolve: () => void; reject: (error: Error) => void }[] = [];
    const poll = vi.fn(
        () =>
            new Promise<void>((resolve, reject) => {
                finishers.push({ resolve, reject });
            }),
    );
    return { poll, finishers };
}

/** A política com o agendamento já de pé, sem Poll na inicialização. */
async function started(overrides: Partial<PollScheduleDeps>) {
    const running = harness(overrides);
    await running.policy.start();
    return running;
}

describe('exclusão mútua entre Polls', () => {
    it('um disparo sem Poll em andamento roda um Poll', async () => {
        const { fire, state } = await started({});

        await fire();

        expect(state.polls).toBe(1);
    });

    it('um disparo durante um Poll em andamento é pulado e registrado, e não entra em fila', async () => {
        const { poll, finishers } = controlledPoll();
        const { fire, state } = await started({ poll });

        const first = fire();
        state.now = new Date(START.getTime() + 5 * MINUTE);
        await fire();

        expect(poll).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('2026-10-31T12:02:00.000Z'));

        finishers[0].resolve();
        await first;

        expect(poll).toHaveBeenCalledTimes(1);
    });

    it('o disparo seguinte, depois do término, roda normalmente', async () => {
        const { poll, finishers } = controlledPoll();
        const { fire } = await started({ poll });

        const first = fire();
        await fire();
        finishers[0].resolve();
        await first;

        const next = fire();

        expect(poll).toHaveBeenCalledTimes(2);
        finishers[1].resolve();
        await next;
    });

    it('um Poll que rejeita é registrado, não rejeita o disparo e libera o seguinte', async () => {
        const failure = new Error('Poll quebrou');
        const poll = vi.fn<() => Promise<void>>().mockRejectedValueOnce(failure).mockResolvedValue();
        const { fire } = await started({ poll });

        await expect(fire()).resolves.toBeUndefined();

        expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);

        await fire();

        expect(poll).toHaveBeenCalledTimes(2);
    });

    it('um Poll que lança antes de devolver a promessa também libera o seguinte', async () => {
        const failure = new Error('Poll quebrou na chamada');
        const poll = vi.fn<() => Promise<void>>().mockImplementationOnce(() => { throw failure; }).mockResolvedValue();
        const { fire } = await started({ poll });

        await expect(fire()).resolves.toBeUndefined();
        await fire();

        expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
        expect(poll).toHaveBeenCalledTimes(2);
    });

    it('o Poll da inicialização também conta: um disparo durante ele é pulado', async () => {
        const { poll, finishers } = controlledPoll();
        const { policy, fire } = harness({ poll, readLastPollAt: async () => null });

        const starting = policy.start();
        await vi.waitFor(() => expect(poll).toHaveBeenCalledTimes(1));

        await fire();

        expect(poll).toHaveBeenCalledTimes(1);
        expect(console.warn).toHaveBeenCalledTimes(1);

        finishers[0].resolve();
        await starting;

        const next = fire();
        expect(poll).toHaveBeenCalledTimes(2);
        finishers[1].resolve();
        await next;
    });

    it('um Poll da inicialização que rejeita não impede o agendamento e libera o primeiro disparo', async () => {
        const failure = new Error('Poll quebrou no boot');
        const poll = vi.fn<() => Promise<void>>().mockRejectedValueOnce(failure).mockResolvedValue();
        const { policy, fire, state } = harness({ poll, readLastPollAt: async () => null });

        await expect(policy.start()).resolves.toBeUndefined();

        expect(state.schedules).toHaveLength(1);
        expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);

        await fire();

        expect(poll).toHaveBeenCalledTimes(2);
    });
});

describe('uma inicialização por processo', () => {
    it('a segunda inicialização não cria um segundo agendamento nem repete o Poll', async () => {
        const { policy, state } = harness({ readLastPollAt: async () => null });

        await policy.start();
        await policy.start();

        expect(state.schedules).toHaveLength(1);
        expect(state.polls).toBe(1);
    });

    it('vale também para duas inicializações ao mesmo tempo', async () => {
        const { policy, state } = harness({ readLastPollAt: async () => null });

        await Promise.all([policy.start(), policy.start()]);

        expect(state.schedules).toHaveLength(1);
        expect(state.polls).toBe(1);
    });

    it('já inicializado, um disparo roda: a marca de inicialização não trava o Poll', async () => {
        const { fire, state } = await started({});

        await fire();
        await fire();

        expect(state.polls).toBe(2);
    });
});

describe('cadência', () => {
    it('é de 5 minutos', () => {
        expect(POLL_CADENCE_MS).toBe(5 * MINUTE);
    });
});

describe('limite de Stale Snapshot', () => {
    it('é de três ciclos: 15 minutos com a cadência da política, e exatamente 15 ainda não é Stale', () => {
        expect(isStaleSnapshot(minutesBefore(START, 14), START)).toBe(false);
        expect(isStaleSnapshot(minutesBefore(START, 15), START)).toBe(false);
        expect(isStaleSnapshot(minutesBefore(START, 16), START)).toBe(true);
    });

    it('acompanha a cadência: com ciclo de 7 minutos, o limite é de 21 minutos', () => {
        const cadenceMs = 7 * MINUTE;

        expect(isStaleSnapshot(minutesBefore(START, 16), START, cadenceMs)).toBe(false);
        expect(isStaleSnapshot(minutesBefore(START, 21), START, cadenceMs)).toBe(false);
        expect(isStaleSnapshot(minutesBefore(START, 22), START, cadenceMs)).toBe(true);
    });

    it('sem nenhum Poll registrado, não há leitura recente a apresentar', () => {
        expect(isStaleSnapshot(null, START)).toBe(true);
    });
});
