import { getLatestStatus } from "@/lib/db-service";
import { StatusCard } from "@/components/status-card";
import { HeroSection } from "@/components/hero-section";
import { StaleSnapshotNotice } from "@/components/stale-snapshot-notice";
import { decideProviderStatus } from "@/lib/provider-status";
import { toProviderStatusInput } from "@/lib/snapshot-reading";
import { decideInternetHealth, lastAnsweredPollAt } from "@/lib/internet-health";

import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = 'force-dynamic';

export default async function Home() {
    // Hora do servidor na renderização: o mesmo relógio vai à leitura do Snapshot, aos módulos e aos cards.
    const now = new Date();
    // Os Providers ativos do Provider Catalog, na ordem de exibição, cada um com o seu resultado.
    const snapshot = await getLatestStatus(now);
    // Hora do último Poll: a leitura respondida mais recente do Snapshot (o Ticket 13 passa a trazê-la da leitura do Snapshot).
    const lastPollAt = lastAnsweredPollAt(snapshot.map(e => e.result));

    // O módulo de Provider Status decide o estado de cada Provider; a página só exibe.
    // Provider com Feed vai com o Feed, lido ou não; Provider só com Probes vai sem Feed, com a resposta dos Probes.
    const statuses = snapshot.map(entry => ({
        ...entry,
        decision: decideProviderStatus(toProviderStatusInput(entry, now)),
    }));

    // O módulo de Internet Health decide o hero a partir dos mesmos itens; a página só passa o resultado.
    const health = decideInternetHealth({ providers: statuses, lastPollAt, now });

    return (
        <main className="min-h-screen bg-transparent flex flex-col">
            <AutoRefresh />
            <HeroSection health={health} />

            <div className="max-w-7xl mx-auto space-y-8 px-8 mt-12 pb-12 w-full">
                <section>
                    <h2 className="text-2xl font-bold mb-6">Service Providers</h2>
                    {health.status === "Stale" && <StaleSnapshotNotice lastPollAt={health.lastPollAt} />}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {statuses.map(({ provider, result, decision }) => (
                            <StatusCard
                                key={provider.id}
                                name={provider.name}
                                logo={provider.logo}
                                statusPageUrl={provider.statusPageUrl}
                                result={result}
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
