import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusCard } from '@/components/status-card';
import type { StatusResult } from '@/lib/fetchers/types';

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

    it('renders provider name correctly', () => {
        render(<StatusCard {...baseProps} result={createResult()} />);
        expect(screen.getByText('AWS')).toBeInTheDocument();
    });

    it('shows operational status with green check icon', () => {
        render(<StatusCard {...baseProps} result={createResult({ status: 'operational' })} />);
        expect(screen.getByText('operational')).toBeInTheDocument();
    });

    it('shows degraded status correctly', () => {
        render(<StatusCard {...baseProps} result={createResult({ status: 'degraded' })} />);
        expect(screen.getByText('degraded')).toBeInTheDocument();
    });

    it('shows outage status correctly', () => {
        render(<StatusCard {...baseProps} result={createResult({ status: 'outage' })} />);
        expect(screen.getByText('outage')).toBeInTheDocument();
    });

    it('displays maintenance status when maintenance incident exists', () => {
        render(
            <StatusCard
                {...baseProps}
                result={createResult({
                    status: 'operational',
                    incidents: [{
                        title: 'Scheduled Maintenance',
                        status: 'maintenance',
                        createdAt: new Date(),
                    }],
                })}
            />
        );
        // "maintenance" appears as the display status and in the incident list
        const maintenanceElements = screen.getAllByText('maintenance');
        expect(maintenanceElements.length).toBeGreaterThan(0);
    });

    it('shows recent incidents from last 48 hours', () => {
        const recentDate = new Date();
        render(
            <StatusCard
                {...baseProps}
                result={createResult({
                    status: 'degraded',
                    incidents: [{
                        title: 'API Latency Issues',
                        status: 'investigating',
                        createdAt: recentDate,
                    }],
                })}
            />
        );
        expect(screen.getByText('API Latency Issues')).toBeInTheDocument();
        expect(screen.getByText('Recent Activity (48h)')).toBeInTheDocument();
    });

    it('does not show incidents older than 48 hours', () => {
        const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago
        render(
            <StatusCard
                {...baseProps}
                result={createResult({
                    status: 'operational',
                    incidents: [{
                        title: 'Old Incident',
                        status: 'resolved',
                        createdAt: oldDate,
                    }],
                })}
            />
        );
        expect(screen.queryByText('Old Incident')).not.toBeInTheDocument();
        expect(screen.queryByText('Recent Activity (48h)')).not.toBeInTheDocument();
    });

    it('renders external link to status page', () => {
        render(<StatusCard {...baseProps} result={createResult()} />);
        const link = screen.getByTitle('Visit Status Page');
        expect(link).toHaveAttribute('href', 'https://status.aws.amazon.com');
        expect(link).toHaveAttribute('target', '_blank');
    });

    it('renders without status page url', () => {
        render(
            <StatusCard
                name="Test Provider"
                result={createResult({ providerId: 'test-provider' })}
            />
        );
        expect(screen.getByText('Test Provider')).toBeInTheDocument();
        expect(screen.queryByTitle('Visit Status Page')).not.toBeInTheDocument();
    });

    it('limits displayed incidents to 3', () => {
        const recentDate = new Date();
        render(
            <StatusCard
                {...baseProps}
                result={createResult({
                    status: 'degraded',
                    incidents: [
                        { title: 'Incident 1', status: 'investigating', createdAt: recentDate },
                        { title: 'Incident 2', status: 'investigating', createdAt: recentDate },
                        { title: 'Incident 3', status: 'investigating', createdAt: recentDate },
                        { title: 'Incident 4', status: 'investigating', createdAt: recentDate },
                    ],
                })}
            />
        );
        expect(screen.getByText('Incident 1')).toBeInTheDocument();
        expect(screen.getByText('Incident 2')).toBeInTheDocument();
        expect(screen.getByText('Incident 3')).toBeInTheDocument();
        expect(screen.queryByText('Incident 4')).not.toBeInTheDocument();
    });
});
