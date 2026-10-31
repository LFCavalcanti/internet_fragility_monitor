import { getDb } from "@/lib/db";
import { readSnapshot } from "@/lib/poll-recording";
import { POLL_CADENCE_MS } from "@/lib/poll-schedule";
import { StatusCard } from "@/components/status-card";
import { HeroSection } from "@/components/hero-section";
import { StaleSnapshotNotice } from "@/components/stale-snapshot-notice";
import { decideProviderStatus } from "@/lib/provider-status";
import { decideInternetHealth } from "@/lib/internet-health";

import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = 'force-dynamic';

export default async function Home() {
    // Hora do servidor na renderização: o mesmo relógio vai à leitura do Snapshot, aos módulos e aos cards.
    const now = new Date();
    // Os Providers ativos do Provider Catalog, na ordem de exibição, cada um com o seu resultado.
    const { providers, lastPollAt } = await readSnapshot(getDb(), now);

    // O módulo de Provider Status decide o estado de cada Provider; a página só exibe.
    const statuses = providers.map(entry => ({
        ...entry,
        decision: decideProviderStatus({ ...entry.reading, now }),
    }));

    // O módulo de Internet Health decide o hero a partir dos mesmos itens; a página só passa o resultado.
    const health = decideInternetHealth({ providers: statuses, lastPollAt, now });

    return (
        <main className="min-h-screen bg-transparent flex flex-col">
            <AutoRefresh cadenceMs={POLL_CADENCE_MS} />
            <HeroSection health={health} />

            <div className="max-w-7xl mx-auto space-y-8 px-8 mt-12 pb-12 w-full">
                <section>
                    <h2 className="text-2xl font-bold mb-6">Providers</h2>
                    {health.status === "Stale" && <StaleSnapshotNotice lastPollAt={health.lastPollAt} />}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {statuses.map(({ provider, lastUpdated, decision }) => (
                            <StatusCard
                                key={provider.id}
                                name={provider.name}
                                logo={provider.logo}
                                statusPageUrl={provider.statusPageUrl}
                                lastUpdated={lastUpdated}
                                decision={decision}
                                now={now}
                            />
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}
