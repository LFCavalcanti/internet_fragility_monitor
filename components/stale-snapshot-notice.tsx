import { STALE_TEXT } from "@/lib/internet-health";
import { formatLastPoll } from "@/lib/format-utc";

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
