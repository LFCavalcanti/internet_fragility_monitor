import { getLatestStatus } from "@/lib/db-service";
import { StatusCard } from "@/components/status-card";
import { HeroSection } from "@/components/hero-section";
import { StaleSnapshotNotice } from "@/components/stale-snapshot-notice";
import { decideProviderStatus } from "@/lib/provider-status";
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
    // Cada Provider tem um Feed; quando a leitura falhou, ele vai como não lido, com os Incidents já gravados.
    const statuses = snapshot.map(({ provider, result }) => ({
        provider,
        result,
        decision: decideProviderStatus({
            feeds: [
                result.status === "unreachable"
                    ? { read: false, incidents: result.incidents }
                    : { read: true, declared: result.status, incidents: result.incidents },
            ],
            probes: [],
            previousPollUnanswered: false,
            now,
        }),
    }));

    // O módulo de Internet Health decide o hero; a página só passa o resultado.
    const health = decideInternetHealth({
        providers: statuses.map(({ provider, decision }) => ({
            providerId: provider.id,
            name: provider.name,
            logo: provider.logo ?? undefined,
            status: decision.status,
            incidents: decision.incidents,
        })),
        majorProviders: statuses.filter(s => s.provider.isMajor).map(s => s.provider.id),
        lastPollAt,
        now,
    });

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
                                logo={provider.logo ?? undefined}
                                statusPageUrl={provider.statusPageUrl ?? undefined}
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
