import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusResult } from "@/lib/fetchers/types";
import type { ProviderStatus, ProviderStatusDecision, UpcomingMaintenanceSummary } from "@/lib/provider-status";
import {
    CircleCheckBig,
    TriangleAlert,
    CircleX,
    ExternalLink,
    Wrench,
    Globe,
    CircleHelp,
    CircleOff,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUtc } from "@/lib/format-utc";
import { formatDistance } from "date-fns";

interface StatusCardProps {
    name: string;
    logo?: string;
    statusPageUrl?: string;
    result: StatusResult;
    /** Estado, Recent Incidents e Upcoming Maintenance decididos pelo módulo de Provider Status. */
    decision: ProviderStatusDecision;
    /** Hora do servidor que a página passou ao módulo: as idades exibidas contam dela, não do relógio. */
    now: Date;
}

const STATUS_ICON: Record<ProviderStatus, { icon: LucideIcon; className: string }> = {
    operational: { icon: CircleCheckBig, className: "text-green-500" },
    degraded: { icon: TriangleAlert, className: "text-yellow-500" },
    outage: { icon: CircleX, className: "text-red-500" },
    maintenance: { icon: Wrench, className: "text-blue-500" },
    unreachable: { icon: CircleHelp, className: "text-muted-foreground" },
    down: { icon: CircleOff, className: "text-red-700" },
};

function formatUpcoming({ count, next }: UpcomingMaintenanceSummary): string {
    const label = `${count} upcoming maintenance${count === 1 ? "" : "s"}`;
    return next ? `${label} · next ${formatUtc(next)}` : label;
}

export function StatusCard({ name, logo, statusPageUrl, result, decision, now }: StatusCardProps) {
    const displayStatus = decision.status;
    const { icon: StatusIcon, className: statusColor } = STATUS_ICON[displayStatus];
    // Unreachable descreve a leitura, não o Provider: card cinza e neutro, sem último status conhecido.
    const unreachable = displayStatus === "unreachable";

    // Recent Incidents já vêm decididos e ordenados pelo módulo: o card só exibe.
    const recentIncidents = decision.incidents;
    const upcoming = decision.upcomingMaintenance;

    return (
        <Card
            data-status={displayStatus}
            className={cn(
                "w-full hover:shadow-lg transition-shadow duration-200 overflow-hidden flex flex-col h-full border-primary/20 bg-card/50 backdrop-blur-sm rounded-none",
                unreachable && "grayscale border-muted bg-muted/30",
            )}
        >
            <CardHeader className="flex flex-row p-0 bg-primary/5 backdrop-blur-xl border-b border-white/10 space-y-0 h-20">
                {/* Left Column: Logo (25%) */}
                <div className="w-1/5 h-full border-r border-white/10 flex items-center justify-center p-2 bg-background/20 relative">
                     {/* Rectangle background for logo area already handled by parent div style, enhancing contrast if needed */}
                    {logo ? (
                        <div className="relative w-8 h-8 overflow-hidden">
                             {/* Keep logo original colors, just ensure it fits */}
                            <Image
                                src={logo}
                                alt={name}
                                width={32}
                                height={32}
                                className="object-contain w-full h-full"
                                unoptimized
                            />
                         </div>
                    ) : (
                        <Globe className="h-8 w-8 text-muted-foreground" />
                    )}
                </div>

                {/* Right Column: Name & Status Icons (75%) */}
                <div className="flex-1 flex flex-row items-center justify-between px-6 h-full">
                    <CardTitle className="text-lg font-bold text-card-foreground truncate pr-2">
                        {name}
                    </CardTitle>

                    <div className="flex items-center gap-2 shrink-0">
                        {statusPageUrl && (
                            <a
                                href={statusPageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="Visit Status Page"
                            >
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        )}
                        <StatusIcon role="img" aria-label={displayStatus} className={cn("h-6 w-6", statusColor)} />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-4 flex-1 flex flex-col">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className={cn("text-2xl font-bold capitalize flex items-center gap-2", unreachable && "text-muted-foreground")}>
                            {displayStatus}
                        </div>
                        {unreachable && (
                            <p className="text-xs text-muted-foreground mt-1">Não foi possível ler a status page</p>
                        )}
                        {result.lastUpdated && (
                            <p className="text-[10px] text-muted-foreground/70">
                                Updated {formatDistance(result.lastUpdated, now, { addSuffix: true })}
                            </p>
                        )}
                        {upcoming && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                                <Wrench className="inline h-3 w-3 mr-1 align-[-2px]" aria-hidden="true" />
                                {statusPageUrl ? (
                                    <a
                                        href={statusPageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:text-primary hover:underline transition-colors"
                                    >
                                        {formatUpcoming(upcoming)}
                                    </a>
                                ) : (
                                    formatUpcoming(upcoming)
                                )}
                            </p>
                        )}
                    </div>
                </div>

                {recentIncidents.length > 0 && (
                    <div className="space-y-2 border-t pt-3 mt-auto">
                        <p className="text-xs font-semibold text-muted-foreground">Recent Incidents</p>
                        {recentIncidents.map((inc, i) => (
                            <div key={i} className="text-xs pl-2 border-l-2 border-primary/50 py-0.5">
                                <p className="font-medium truncate">{inc.title}</p>
                                <p className="text-muted-foreground text-[10px] flex justify-between">
                                    <span>{inc.status.replace("_", " ")}</span>
                                    <span>{formatDistance(inc.createdAt, now, { addSuffix: true })}</span>
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
