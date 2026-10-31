"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Pede uma nova renderização ao servidor no ritmo da cadência dos Polls, que a página entrega. */
export function AutoRefresh({ cadenceMs }: { cadenceMs: number }) {
    const router = useRouter();

    useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, cadenceMs);

        return () => clearInterval(interval);
    }, [router, cadenceMs]);

    return null;
}
