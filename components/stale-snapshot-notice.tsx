import { STALE_TEXT } from "@/lib/internet-health";

/**
 * Hora do último Poll para exibição, em UTC para não depender do fuso do servidor
 * (mesma convenção da linha de Upcoming Maintenance do card).
 */
export function formatLastPoll(lastPollAt: Date | null): string {
    if (!lastPollAt) return "No Poll recorded yet.";

    const when = lastPollAt.toLocaleString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    return `Last Poll: ${when} UTC`;
}

interface StaleSnapshotNoticeProps {
    lastPollAt: Date | null;
}

/** Aviso da página para um Stale Snapshot: os cards mostram o último Snapshot, que pode estar desatualizado. */
export function StaleSnapshotNotice({ lastPollAt }: StaleSnapshotNoticeProps) {
    return (
        <div
            role="status"
            className="mb-6 border border-white/20 bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
            <span className="font-semibold text-foreground">{STALE_TEXT}.</span>{" "}
            The provider cards may be out of date. {formatLastPoll(lastPollAt)}
        </div>
    );
}
