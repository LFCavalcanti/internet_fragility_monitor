/**
 * Formatação única de datas para exibição: em UTC, para não depender do fuso do servidor.
 * `hourCycle: "h23"` mostra a meia-noite como 00:xx (`hour12: false` pode mostrar 24:xx).
 */
export function formatUtc(date: Date): string {
    const when = date.toLocaleString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
    return `${when} UTC`;
}

/** Hora do último Poll para o hero e o aviso de Stale Snapshot. */
export function formatLastPoll(lastPollAt: Date | null): string {
    return lastPollAt ? `Last Poll: ${formatUtc(lastPollAt)}` : "No Poll recorded yet.";
}
