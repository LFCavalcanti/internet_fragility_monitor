import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusCard } from '@/components/status-card';
import type { StatusResult } from '@/lib/fetchers/types';
import type { ProviderStatusDecision } from '@/lib/provider-status';

// Mock recharts ResponsiveContainer which requires browser dimensions
vi.mock('recharts', async () => {
    const actual = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
            <div data-testid="responsive-container">{children}</div>
        ),
    };
});

// Mock next/image - filter out Next.js specific props that aren't valid HTML attributes
vi.mock('next/image', () => ({
    default: ({ src, alt, unoptimized, priority, fill, ...props }: {
        src: string;
        alt: string;
        unoptimized?: boolean;
        priority?: boolean;
        fill?: boolean;
    }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} {...props} />
    ),
}));

describe('StatusCard', () => {
    const baseProps = {
        name: 'AWS',
        logo: '/logos/aws.svg',
        statusPageUrl: 'https://status.aws.amazon.com',
    };

    const createResult = (overrides: Partial<StatusResult> = {}): StatusResult => ({
        providerId: 'aws',
        status: 'operational',
        incidents: [],
        lastUpdated: new Date(),
        ...overrides,
    });

    const createDecision = (overrides: Partial<ProviderStatusDecision> = {}): ProviderStatusDecision => ({
        status: 'operational',
        incidents: [],
        upcomingMaintenance: null,
        ...overrides,
    });

    const renderCard = (decision: Partial<ProviderStatusDecision> = {}, props: Partial<typeof baseProps> = {}) =>
        render(<StatusCard {...baseProps} {...props} result={createResult()} decision={createDecision(decision)} />);

    it('renders provider name correctly', () => {
        renderCard();
        expect(screen.getByText('AWS')).toBeInTheDocument();
    });

    it.each([
        ['operational', 'text-green-500'],
        ['degraded', 'text-yellow-500'],
        ['outage', 'text-red-500'],
        ['maintenance', 'text-blue-500'],
        ['unreachable', 'text-muted-foreground'],
        ['down', 'text-red-700'],
    ] as const)('mostra o estado %s decidido pelo módulo, com a cor certa', (status, color) => {
        renderCard({ status });
        expect(screen.getByText(status)).toBeInTheDocument();
        expect(screen.getByRole('img', { name: status })).toHaveClass(color);
    });

    it('mostra o estado do módulo, não o declarado pelo Feed', () => {
        render(
            <StatusCard
                {...baseProps}
                result={createResult({ status: 'operational' })}
                decision={createDecision({ status: 'maintenance' })}
            />
        );
        expect(screen.getByText('maintenance')).toBeInTheDocument();
        expect(screen.queryByText('operational')).not.toBeInTheDocument();
    });

    it('mostra a linha de Upcoming Maintenance com a quantidade, a data da próxima e link para a status page', () => {
        renderCard({
            status: 'outage',
            upcomingMaintenance: { count: 25, next: new Date('2026-10-27T01:00:00Z') },
        });

        const line = screen.getByRole('link', { name: /25 upcoming maintenances/ });
        expect(line).toHaveTextContent('25 upcoming maintenances · next Oct 27, 01:00 UTC');
        expect(line).toHaveAttribute('href', 'https://status.aws.amazon.com');
        expect(line).toHaveAttribute('target', '_blank');
        expect(screen.getByText('outage')).toBeInTheDocument();
    });

    it('linha de Upcoming Maintenance no singular e sem data quando o Feed não marca data', () => {
        renderCard({ upcomingMaintenance: { count: 1, next: null } });
        expect(screen.getByRole('link', { name: '1 upcoming maintenance' })).toBeInTheDocument();
    });

    it('linha de Upcoming Maintenance sem link quando não há status page', () => {
        renderCard({ upcomingMaintenance: { count: 2, next: null } }, { statusPageUrl: undefined });
        expect(screen.getByText('2 upcoming maintenances')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /upcoming/ })).not.toBeInTheDocument();
    });

    it('sem Upcoming Maintenance não há linha', () => {
        renderCard();
        expect(screen.queryByText(/upcoming maintenance/)).not.toBeInTheDocument();
    });

    it('shows recent incidents from last 48 hours', () => {
        const recentDate = new Date();
        renderCard({
            status: 'degraded',
            incidents: [{
                kind: 'problem',
                title: 'API Latency Issues',
                status: 'investigating',
                createdAt: recentDate,
            }],
        });
        expect(screen.getByText('API Latency Issues')).toBeInTheDocument();
        expect(screen.getByText('Recent Activity (48h)')).toBeInTheDocument();
    });

    it('mostra a manutenção em andamento na lista com a fase legível', () => {
        renderCard({
            status: 'maintenance',
            incidents: [{
                kind: 'maintenance',
                title: 'Network upgrade',
                status: 'in_progress',
                createdAt: new Date(),
            }],
        });
        expect(screen.getByText('Network upgrade')).toBeInTheDocument();
        expect(screen.getByText('in progress')).toBeInTheDocument();
    });

    it('does not show incidents older than 48 hours', () => {
        const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago
        renderCard({
            incidents: [{
                kind: 'problem',
                title: 'Old Incident',
                status: 'resolved',
                createdAt: oldDate,
            }],
        });
        expect(screen.queryByText('Old Incident')).not.toBeInTheDocument();
        expect(screen.queryByText('Recent Activity (48h)')).not.toBeInTheDocument();
    });

    it('renders external link to status page', () => {
        renderCard();
        const link = screen.getByTitle('Visit Status Page');
        expect(link).toHaveAttribute('href', 'https://status.aws.amazon.com');
        expect(link).toHaveAttribute('target', '_blank');
    });

    it('renders without status page url', () => {
        render(
            <StatusCard
                name="Test Provider"
                result={createResult({ providerId: 'test-provider' })}
                decision={createDecision()}
            />
        );
        expect(screen.getByText('Test Provider')).toBeInTheDocument();
        expect(screen.queryByTitle('Visit Status Page')).not.toBeInTheDocument();
    });

    it('limits displayed incidents to 3', () => {
        const recentDate = new Date();
        renderCard({
            status: 'degraded',
            incidents: [
                { kind: 'problem', title: 'Incident 1', status: 'investigating', createdAt: recentDate },
                { kind: 'problem', title: 'Incident 2', status: 'investigating', createdAt: recentDate },
                { kind: 'problem', title: 'Incident 3', status: 'investigating', createdAt: recentDate },
                { kind: 'problem', title: 'Incident 4', status: 'investigating', createdAt: recentDate },
            ],
        });
        expect(screen.getByText('Incident 1')).toBeInTheDocument();
        expect(screen.getByText('Incident 2')).toBeInTheDocument();
        expect(screen.getByText('Incident 3')).toBeInTheDocument();
        expect(screen.queryByText('Incident 4')).not.toBeInTheDocument();
    });
});
