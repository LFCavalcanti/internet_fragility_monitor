import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroSection } from '@/components/hero-section';

vi.mock('next/image', () => ({
    default: ({ src, alt }: { src: string; alt: string }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} />
    ),
}));

describe('HeroSection', () => {
    it('mostra o Internet Health e o texto quando não há destaque', () => {
        render(
            <HeroSection
                health={{ status: 'Healthy', description: 'All monitored services are operating normally.' }}
            />,
        );

        expect(screen.getByText('Healthy')).toBeInTheDocument();
        expect(screen.getByText('All monitored services are operating normally.')).toBeInTheDocument();
    });

    it('rotula o estado com Internet Health, o termo do glossário', () => {
        render(
            <HeroSection
                health={{ status: 'Healthy', description: 'All monitored services are operating normally.' }}
            />,
        );

        expect(screen.getByText('Internet Health:')).toBeInTheDocument();
        expect(screen.queryByText(/global status/i)).not.toBeInTheDocument();
    });

    it('com destaque, mostra o texto do Internet Health junto do destaque', () => {
        render(
            <HeroSection
                health={{
                    status: 'Critical',
                    description: 'Major outage across 3 providers. Internet stability is at risk.',
                    highlight: {
                        type: 'outage',
                        title: 'Widespread Outage',
                        providerName: 'Multiple Providers',
                        description: 'Outages detected in AWS, Heroku, Vercel.',
                    },
                }}
            />,
        );

        expect(screen.getByText('Critical')).toBeInTheDocument();
        expect(screen.getByText('Major outage across 3 providers. Internet stability is at risk.')).toBeInTheDocument();
        expect(screen.getByText('Widespread Outage')).toBeInTheDocument();
        expect(screen.getByText('Outages detected in AWS, Heroku, Vercel.')).toBeInTheDocument();
    });

    it('Down tem destaque próprio, com "Status page and service not responding"', () => {
        render(
            <HeroSection
                health={{
                    status: 'Critical',
                    description: 'Major outage at AWS. Internet stability is at risk.',
                    highlight: {
                        type: 'down',
                        title: 'Major Outage',
                        providerName: 'AWS',
                        providerLogo: 'https://logos.example/aws.svg',
                        description: 'Status page and service not responding',
                    },
                }}
            />,
        );

        expect(screen.getByText('Critical')).toBeInTheDocument();
        expect(screen.getByText('Major Outage')).toBeInTheDocument();
        expect(screen.getByText('AWS')).toBeInTheDocument();
        expect(screen.getByText('Major outage at AWS. Internet stability is at risk.')).toBeInTheDocument();
        expect(screen.getByText('Status page and service not responding')).toBeInTheDocument();
        expect(screen.getByTestId('hero-highlight')).toHaveAttribute('data-type', 'down');
    });

    it('Stale Snapshot mostra o estado neutro "No recent reading" com a hora do último Poll, sem destaque', () => {
        render(<HeroSection health={{ status: 'Stale', lastPollAt: new Date('2026-10-26T14:44:00Z') }} />);

        expect(screen.getByText('No recent reading')).toBeInTheDocument();
        expect(screen.getByText('Last Poll: Oct 26, 14:44 UTC')).toBeInTheDocument();
        expect(screen.queryByTestId('hero-highlight')).not.toBeInTheDocument();
        expect(screen.queryByText('Critical')).not.toBeInTheDocument();
    });

    it('Stale Snapshot sem nenhum Poll registrado diz que ainda não houve Poll', () => {
        render(<HeroSection health={{ status: 'Stale', lastPollAt: null }} />);

        expect(screen.getByText('No recent reading')).toBeInTheDocument();
        expect(screen.getByText('No Poll recorded yet.')).toBeInTheDocument();
    });
});
