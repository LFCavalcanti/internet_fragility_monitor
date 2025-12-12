"use client";

import Image from "next/image";

export function TopBar() {
    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
            <div className="max-w-7xl mx-auto w-full flex h-16 items-center justify-between px-8">
                <div className="flex items-center gap-3">
                    <Image
                        src="/logo.svg"
                        alt="Internet Fragility Monitor"
                        width={40}
                        height={40}
                        className="h-10 w-10"
                    />
                    <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/50">
                        Internet Fragility Monitor
                    </h1>
                </div>
            </div>
        </header>
    );
}
