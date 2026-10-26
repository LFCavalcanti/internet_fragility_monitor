import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusResult } from "@/lib/fetchers/types";
import { Activity, CircleCheckBig, TriangleAlert, CircleX, ExternalLink, Wrench, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, ResponsiveContainer, Tooltip } from "recharts";
import { formatDistanceToNow } from "date-fns";

interface StatusCardProps {
    name: string;
    logo?: string;
    statusPageUrl?: string;
    result: StatusResult;
}

export function StatusCard({ name, logo, statusPageUrl, result }: StatusCardProps) {
    // Check if there are any maintenance incidents in the recent timeframe
    const hasMaintenanceIncident = result.incidents.some(inc => inc.status === 'maintenance');

    const isOperational = result.status === "operational" && !hasMaintenanceIncident;
    const isDegraded = result.status === "degraded" && !hasMaintenanceIncident;
    const isOutage = result.status === "outage";
    const isMaintenance = hasMaintenanceIncident;

    // Filter incidents to only show those from the last 48 hours
    const recentIncidents = result.incidents.filter(inc => {
        const incidentTime = new Date(inc.createdAt).getTime();
        const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
        return incidentTime > fortyEightHoursAgo;
    });

    // Display status - prioritize maintenance if present
    const displayStatus = isMaintenance ? "maintenance" : result.status;

    return (
        <Card className="w-full hover:shadow-lg transition-shadow duration-200 overflow-hidden flex flex-col h-full border-primary/20 bg-card/50 backdrop-blur-sm rounded-none">
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
                        {isOperational && <CircleCheckBig className="h-6 w-6 text-green-500" />}
                        {isDegraded && <TriangleAlert className="h-6 w-6 text-yellow-500" />}
                        {isOutage && <CircleX className="h-6 w-6 text-red-500" />}
                        {isMaintenance && <Wrench className="h-6 w-6 text-blue-500" />}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-4 flex-1 flex flex-col">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="text-2xl font-bold capitalize flex items-center gap-2">
                            {displayStatus}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {(displayStatus as any) === 'unknown' || !displayStatus ? (result.responseTime ? `${result.responseTime}ms latency` : "") : ""}
                        </p>
                        {result.lastUpdated && (
                            <p className="text-[10px] text-muted-foreground/70">
                                Updated {formatDistanceToNow(result.lastUpdated, { addSuffix: true })}
                            </p>
                        )}
                    </div>
                </div>

                {recentIncidents.length > 0 && (
                    <div className="space-y-2 border-t pt-3 mt-auto">
                        <p className="text-xs font-semibold text-muted-foreground">Recent Activity (48h)</p>
                        {recentIncidents.slice(0, 3).map((inc, i) => (
                            <div key={i} className="text-xs pl-2 border-l-2 border-primary/50 py-0.5">
                                <p className="font-medium truncate">{inc.title}</p>
                                <p className="text-muted-foreground text-[10px] flex justify-between">
                                    <span>{inc.status}</span>
                                    <span>{formatDistanceToNow(new Date(inc.createdAt), { addSuffix: true })}</span>
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
