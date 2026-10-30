/** Relógio dos testes: instantes contados para trás a partir de um `now` fixo. */
const HOUR_MS = 60 * 60 * 1000;

/** O instante `hours` horas antes de `now`. */
export function hoursBefore(now: Date, hours: number): Date {
    return new Date(now.getTime() - hours * HOUR_MS);
}
