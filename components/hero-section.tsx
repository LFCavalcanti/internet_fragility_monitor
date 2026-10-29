"use client";

import { NetworkIllustration } from "./network-illustration";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { STALE_TEXT, type HeroHighlight, type InternetHealth } from "@/lib/internet-health";
import { formatLastPoll } from "./stale-snapshot-notice";

interface HeroSectionProps {
    /** Internet Health decidido pelo módulo; o hero só exibe. */
    health: InternetHealth;
}

const HIGHLIGHT_ICON: Record<HeroHighlight["type"], string> = {
    down: "⛔",
    outage: "🔴",
    degraded: "⚠️",
};

export function HeroSection({ health }: HeroSectionProps) {
    const { status, highlight } = health;
    // Stale Snapshot: estado neutro com a hora do último Poll, no lugar de qualquer Internet Health.
    const [label, description] =
        health.status === "Stale"
            ? [STALE_TEXT, formatLastPoll(health.lastPollAt)]
            : [health.status, health.description];

    const getStatusColor = () => {
        switch (status) {
            case "Stale":
                return "text-muted-foreground";
            case "Healthy":
                return "text-green-500";
            case "Unstable":
                return "text-yellow-500";
            case "Critical":
                return "text-red-500";
        }
    };


    return (
        <section className="relative overflow-hidden w-full border-b border-white/10 min-h-[500px]">
            {/* Global glass background for the whole section */}
            <div className="absolute inset-0 bg-background/40 backdrop-blur-xl pointer-events-none z-10" />
            
            {/* Split Background Layer - Full Width */}
            <div className="absolute inset-0 grid grid-cols-1 md:grid-cols-2 z-0">
                <div className="bg-primary/5 h-full w-full" />
                <div className="bg-black/20 h-full w-full relative overflow-hidden">
                     {/* Background Grid Pattern for visual interest */}
                     <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
                </div>
            </div>

            {/* Content Container - Constrained Width */}
            <div className="relative z-20 max-w-7xl mx-auto px-8 w-full h-full"> 
                <div className="grid grid-cols-1 md:grid-cols-2 h-full min-h-[500px]">
                    
                    {/* Left Column: Text & Status */}
                    <div className="flex flex-col justify-center py-8 md:py-16 md:pr-8">
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-6">
                            <span className="text-lg font-medium text-muted-foreground">Global Status:</span>
                            <span className={cn("text-4xl md:text-5xl font-extrabold tracking-tight", getStatusColor())}>
                                {label}
                            </span>
                        </div>

                        {highlight ? (
                            <div
                                data-testid="hero-highlight"
                                data-type={highlight.type}
                                className={cn(
                                    "mt-6 p-4 bg-background/40 border backdrop-blur-sm",
                                    highlight.type === "down" ? "border-red-700" : "border-white/10",
                                )}
                            >
                                {/* Line 1: Icon + Bold Title */}
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xl">
                                        {HIGHLIGHT_ICON[highlight.type]}
                                    </span>
                                    <span className="text-lg font-bold text-foreground">
                                        {highlight.title}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                                    {highlight.providerLogo ? (
                    <Image
                        src={highlight.providerLogo}
                        alt={highlight.providerName}
                        width={24}
                        height={24}
                        className="w-6 h-6 object-contain"
                    />                ) : (
                                        <span className="text-sm">🏢</span>
                                    )}
                                    <span className="text-sm font-medium">
                                        {highlight.providerName}
                                    </span>
                                </div>

                                {/* Line 3: Description */}
                                <p className="text-sm text-muted-foreground">
                                    {highlight.description}
                                </p>
                            </div>
                        ) : (
                            <p className="text-lg text-muted-foreground max-w-xl">
                                {description}
                            </p>
                        )}
                    </div>

                    {/* Right Column: Illustration */}
                    <div className="flex justify-center items-center h-full py-8 md:py-0 md:pl-8">
                        <NetworkIllustration status={status} />
                    </div>
                </div>
            </div>
        </section>
    );
}
