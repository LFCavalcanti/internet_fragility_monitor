import { getLatestStatus } from "@/lib/db-service";
import { providersList } from "@/lib/fetchers";
import { StatusCard } from "@/components/status-card";
import { HeroSection } from "@/components/hero-section";
import { decideProviderStatus } from "@/lib/provider-status";
import type { IncidentData } from "@/lib/fetchers/types";

import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = 'force-dynamic';

const isActiveProblem = (i: IncidentData) => i.kind === "problem" && i.status !== "resolved";

export default async function Home() {
    const snapshot = await getLatestStatus();
    const now = new Date();

    // O módulo de Provider Status decide o estado de cada Provider; a página só exibe.
    // Até o Ticket 03 cada Provider tem um Feed, sempre tratado como lido.
    const statuses = snapshot.map(result => ({
        providerId: result.providerId,
        result,
        decision: decideProviderStatus({
            feeds: [{ read: true, declared: result.status, incidents: result.incidents }],
            probes: [],
            previousPollUnanswered: false,
            now,
        }),
    }));

    // Global status logic (Ticket 05 moves it to the Internet Health module).
    // Maintenance never hides a declared Outage or Degraded: the module already applied the precedence.
    const criticalIncidents = statuses
        .filter(s => s.decision.status === "outage" || s.decision.status === "down")
        .map(s => ({ providerId: s.providerId, incidents: s.decision.incidents }));
    const degradedServices = statuses
        .filter(s => s.decision.status === "degraded")
        .map(s => ({ providerId: s.providerId, incidents: s.decision.incidents }));

    // Check if incidents affect multiple major providers (global impact)
    const majorProviders = ["aws", "google-cloud", "azure"];
    const affectedMajorProviders = [...criticalIncidents, ...degradedServices]
        .filter(s => majorProviders.includes(s.providerId));

    let globalStatus: "Healthy" | "Unstable" | "Critical" = "Healthy";
    let description = "All monitored services are operating normally.";

    interface CompromisedService {
        title: string;
        providerName: string;
        providerLogo?: string;
        description: string;
        type: 'outage' | 'degraded';
    }

    let compromisedService: CompromisedService | undefined;

    if (criticalIncidents.length > 0) {
        if (affectedMajorProviders.length >= 2) {
            globalStatus = "Critical";
            description = `Multiple major infrastructure providers are experiencing outages. This may indicate widespread internet disruption.`;
            compromisedService = {
                title: "Critical Infrastructure Outage",
                providerName: "Multiple Providers",
                description: `Major outages detected in ${affectedMajorProviders.map(p => p.providerId).join(", ")}.`,
                type: 'outage'
            };
        } else if (criticalIncidents.length >= 1) {
            globalStatus = "Critical";
            description = `${criticalIncidents.length} service${criticalIncidents.length > 1 ? 's are' : ' is'} experiencing critical issues.`;
            const provider = providersList.find(p => p.id === criticalIncidents[0].providerId);
            // Find the active incident if possible, ignoring resolved and maintenance
            const activeIncident = criticalIncidents[0].incidents.find(isActiveProblem) || criticalIncidents[0].incidents[0];

            compromisedService = {
                title: "Service Outage",
                providerName: provider?.name || criticalIncidents[0].providerId,
                providerLogo: provider?.logo,
                description: activeIncident?.title || "Critical issue reported.",
                type: 'outage'
            };
        }
    } else if (degradedServices.length > 0) {
        if (affectedMajorProviders.length >= 2) {
            globalStatus = "Unstable";
            description = `Multiple major providers are experiencing degraded service. Global internet stability may be affected.`;
            compromisedService = {
                title: "Widespread Instability",
                providerName: "Multiple Providers",
                description: `Degraded service detected in ${affectedMajorProviders.map(p => p.providerId).join(", ")}.`,
                type: 'degraded'
            };
        } else {
            globalStatus = "Unstable";
            description = `${degradedServices.length} service${degradedServices.length > 1 ? 's are' : ' is'} experiencing degraded service.`;
            const provider = providersList.find(p => p.id === degradedServices[0].providerId);
            // Find the active incident if possible, ignoring resolved and maintenance
            const activeIncident = degradedServices[0].incidents.find(isActiveProblem) || degradedServices[0].incidents[0];

            compromisedService = {
                title: "Service Degraded",
                providerName: provider?.name || degradedServices[0].providerId,
                providerLogo: provider?.logo,
                description: activeIncident?.title || "Service issues reported.",
                type: 'degraded'
            };
        }
    }

    return (
        <main className="min-h-screen bg-transparent flex flex-col">
            <AutoRefresh />
            <HeroSection status={globalStatus} description={description} compromisedService={compromisedService} />

            <div className="max-w-7xl mx-auto space-y-8 px-8 mt-12 pb-12 w-full">
                <section>
                    <h2 className="text-2xl font-bold mb-6">Service Providers</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {providersList.map(provider => {
                            const entry = statuses.find(s => s.providerId === provider.id);
                            if (!entry) return null;
                            return (
                                <StatusCard
                                    key={provider.id}
                                    name={provider.name}
                                    logo={provider.logo}
                                    statusPageUrl={provider.statusPageUrl}
                                    result={entry.result}
                                    decision={entry.decision}
                                />
                            );
                        })}
                    </div>
                </section>
            </div>
        </main>
    );
}
