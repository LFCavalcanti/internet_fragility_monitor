"use client";

import { NetworkIllustration } from "./network-illustration";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface CompromisedService {
    title: string;
    providerName: string;
    providerLogo?: string;
    description: string;
    type: 'outage' | 'degraded';
}

interface HeroSectionProps {
    status: "Healthy" | "Unstable" | "Critical";
    description: string;
    compromisedService?: CompromisedService;
}

export function HeroSection({ status, description, compromisedService }: HeroSectionProps) {
    const getStatusColor = () => {
        switch (status) {
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
                                {status}
                            </span>
                        </div>

                        {compromisedService ? (
                            <div className="mt-6 p-4 bg-background/40 border border-white/10 backdrop-blur-sm">
                                {/* Line 1: Icon + Bold Title */}
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xl">
                                        {compromisedService?.type === 'outage' ? '🔴' : '⚠️'}
                                    </span>
                                    <span className="text-lg font-bold text-foreground">
                                        {compromisedService?.title}
                                    </span>
                                </div>

                                <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                                    {compromisedService?.providerLogo ? (
                    <Image
                        src={compromisedService.providerLogo}
                        alt={compromisedService.providerName}
                        width={24}
                        height={24}
                        className="w-6 h-6 object-contain"
                    />                ) : (
                                        <span className="text-sm">🏢</span>
                                    )}
                                    <span className="text-sm font-medium">
                                        {compromisedService?.providerName}
                                    </span>
                                </div>

                                {/* Line 3: Description */}
                                <p className="text-sm text-muted-foreground">
                                    {compromisedService?.description}
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
