"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh() {
    const router = useRouter();

    useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, 5 * 60 * 1000); // 5 minutes

        return () => clearInterval(interval);
    }, [router]);

    return null;
}
