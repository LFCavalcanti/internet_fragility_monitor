"use client";

import { cn } from "@/lib/utils";

interface NetworkIllustrationProps {
    status: "Healthy" | "Unstable" | "Critical";
}

export function NetworkIllustration({ status }: NetworkIllustrationProps) {
    // Base duration = 3s for Healthy (standard speed)
    // Unstable = 25% slower = 3.75s
    // Critical = 50% slower = 4.5s
    const getAnimationDuration = () => {
        const base = 3;
        switch (status) {
            case "Healthy":
                return base;
            case "Unstable":
                return base * 1.25;
            case "Critical":
                return base * 1.5;
        }
    };

    // Get status-based color for animated packets
    const getPacketColor = () => {
        switch (status) {
            case "Healthy":
                return "text-green-500";
            case "Unstable":
                return "text-yellow-500";
            case "Critical":
                return "text-red-500";
        }
    };

    const duration = getAnimationDuration();
    const packetColor = getPacketColor();

    // Node positions for two parallel paths:
    // Path 1: Users -> Firewall1 -> Server1/2 -> Database1
    // Path 2: Users -> Firewall2 -> Server3/4 -> Database2
    const nodes = {
        // Users (left column)
        user1: { x: 50, y: 60 },
        user2: { x: 50, y: 150 },
        user3: { x: 50, y: 240 },
        // Firewalls (second column)
        firewall1: { x: 150, y: 75 },
        firewall2: { x: 150, y: 225 },
        // Servers (third column) - same size as firewalls, more spacing
        server1: { x: 270, y: 45 },
        server2: { x: 270, y: 105 },
        server3: { x: 270, y: 195 },
        server4: { x: 270, y: 255 },
        // Databases (right column) - one per firewall group
        database1: { x: 390, y: 75 },
        database2: { x: 390, y: 225 },
    };

    // Connection paths: [from, to]
    const connections: [keyof typeof nodes, keyof typeof nodes][] = [
        // Users to firewalls
        ["user1", "firewall1"],
        ["user2", "firewall1"],
        ["user2", "firewall2"],
        ["user3", "firewall2"],
        // Firewall 1 group
        ["firewall1", "server1"],
        ["firewall1", "server2"],
        ["server1", "database1"],
        ["server2", "database1"],
        // Firewall 2 group
        ["firewall2", "server3"],
        ["firewall2", "server4"],
        ["server3", "database2"],
        ["server4", "database2"],
    ];

    return (
        <div className="w-full h-full flex items-center justify-center relative">
            <svg
                viewBox="0 0 450 300"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={cn(
                    "w-full h-full max-w-lg transition-all duration-500",
                    status === "Critical" ? "opacity-70" : "opacity-100"
                )}
            >
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* --- BASE CONNECTION LINES --- */}
                {connections.map(([from, to], i) => (
                    <line
                        key={`line-${i}`}
                        x1={nodes[from].x}
                        y1={nodes[from].y}
                        x2={nodes[to].x}
                        y2={nodes[to].y}
                        className="stroke-muted-foreground/20"
                        strokeWidth="1"
                    />
                ))}

                {/* --- ANIMATED DATA PACKETS (Bidirectional with randomness) --- */}
                {connections.map(([from, to], i) => {
                    const fromNode = nodes[from];
                    const toNode = nodes[to];
                    const forwardPath = `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`;
                    const reversePath = `M ${toNode.x} ${toNode.y} L ${fromNode.x} ${fromNode.y}`;
                    
                    // Pseudo-random delays based on connection index for variety
                    const forwardDelay = (i * 0.37 + 0.1) % duration;
                    const reverseDelay = (i * 0.53 + 0.7) % duration;

                    return (
                        <g key={`packet-group-${i}`}>
                            {/* Forward packet (left to right) */}
                            <circle
                                r="3"
                                className={cn("fill-current", packetColor)}
                                filter="url(#glow)"
                                style={{
                                    offsetPath: `path('${forwardPath}')`,
                                    animationName: 'data-packet',
                                    animationDuration: `${duration}s`,
                                    animationTimingFunction: 'linear',
                                    animationIterationCount: 'infinite',
                                    animationDelay: `${forwardDelay}s`,
                                    offsetRotate: '0deg',
                                } as React.CSSProperties}
                            />
                            {/* Reverse packet (right to left) */}
                            <circle
                                r="3"
                                className={cn("fill-current", packetColor)}
                                filter="url(#glow)"
                                style={{
                                    offsetPath: `path('${reversePath}')`,
                                    animationName: 'data-packet',
                                    animationDuration: `${duration}s`,
                                    animationTimingFunction: 'linear',
                                    animationIterationCount: 'infinite',
                                    animationDelay: `${reverseDelay}s`,
                                    offsetRotate: '0deg',
                                } as React.CSSProperties}
                            />
                        </g>
                    );
                })}

                {/* --- USER NODES --- */}
                {[nodes.user1, nodes.user2, nodes.user3].map((pos, i) => (
                    <g key={`user-${i}`} transform={`translate(${pos.x}, ${pos.y})`} className="text-muted-foreground">
                        <circle r="18" className="fill-background/60 stroke-current stroke-1" />
                        {/* Person icon */}
                        <circle cx="0" cy="-4" r="4" className="fill-current" />
                        <path d="M-6 8 Q0 2 6 8 V10 H-6 Z" className="fill-current" />
                    </g>
                ))}

                {/* --- FIREWALL NODES --- */}
                {[nodes.firewall1, nodes.firewall2].map((pos, i) => (
                    <g key={`fw-${i}`} transform={`translate(${pos.x}, ${pos.y})`} className="text-muted-foreground">
                        <rect x="-20" y="-22" width="40" height="44" rx="2" className="fill-background/60 stroke-current stroke-1" />
                        {/* Brick pattern */}
                        <path
                            d="M-20 -11 H20 M-20 0 H20 M-20 11 H20 M0 -22 V-11 M-10 -11 V0 M10 -11 V0 M0 0 V11 M-10 11 V22 M10 11 V22"
                            className="stroke-current stroke-[0.5] opacity-40"
                        />
                    </g>
                ))}

                {/* --- SERVER NODES (same size as firewalls: 40x44) --- */}
                {[nodes.server1, nodes.server2, nodes.server3, nodes.server4].map((pos, i) => (
                    <g key={`srv-${i}`} transform={`translate(${pos.x}, ${pos.y})`} className="text-muted-foreground">
                        {/* Server rack unit - same size as firewall */}
                        <rect x="-20" y="-22" width="40" height="44" rx="2" className="fill-background/60 stroke-current stroke-1" />
                        {/* Drive bays (left side) */}
                        <rect x="-16" y="-17" width="12" height="6" rx="1" className="fill-current opacity-25" />
                        <rect x="-16" y="-9" width="12" height="6" rx="1" className="fill-current opacity-25" />
                        <rect x="-16" y="-1" width="12" height="6" rx="1" className="fill-current opacity-25" />
                        <rect x="-16" y="7" width="12" height="6" rx="1" className="fill-current opacity-25" />
                        {/* Ventilation/Status panel (right side) */}
                        <rect x="2" y="-17" width="14" height="30" rx="1" className="stroke-current stroke-[0.5] fill-none opacity-30" />
                        {/* Status LEDs */}
                        <circle cx="9" cy="-11" r="2" className="fill-current opacity-40" />
                        <circle cx="9" cy="-3" r="2" className="fill-current opacity-40" />
                        <circle cx="9" cy="5" r="2" className="fill-current opacity-40" />
                    </g>
                ))}

                {/* --- DATABASE NODES --- */}
                {[nodes.database1, nodes.database2].map((pos, i) => (
                    <g key={`db-${i}`} transform={`translate(${pos.x}, ${pos.y})`} className="text-muted-foreground">
                        {/* DB Cylinder */}
                        <path d="M-18 -20 V20 C-18 26 18 26 18 20 V-20" className="fill-background/60 stroke-current stroke-1" />
                        <ellipse cx="0" cy="-20" rx="18" ry="5" className="fill-background/60 stroke-current stroke-1" />
                        <path d="M-18 -5 C-18 1 18 1 18 -5" className="stroke-current stroke-1 fill-none opacity-50" />
                        <path d="M-18 10 C-18 16 18 16 18 10" className="stroke-current stroke-1 fill-none opacity-50" />
                    </g>
                ))}
            </svg>
        </div>
    );
}
