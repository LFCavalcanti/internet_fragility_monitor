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

    it('Down tem destaque próprio, com "status page e serviço sem resposta"', () => {
        render(
            <HeroSection
                health={{
                    status: 'Critical',
                    description: '1 provider is reporting a major outage.',
                    highlight: {
                        type: 'down',
                        title: 'Service Down',
                        providerName: 'AWS',
                        providerLogo: 'https://logos.example/aws.svg',
                        description: 'Status page e serviço sem resposta',
                    },
                }}
            />,
        );

        expect(screen.getByText('Critical')).toBeInTheDocument();
        expect(screen.getByText('Service Down')).toBeInTheDocument();
        expect(screen.getByText('AWS')).toBeInTheDocument();
        expect(screen.getByText('Status page e serviço sem resposta')).toBeInTheDocument();
        expect(screen.getByTestId('hero-highlight')).toHaveAttribute('data-type', 'down');
    });

    it('Stale Snapshot mostra o estado neutro "Sem leitura recente" com a hora do último Poll, sem destaque', () => {
        render(<HeroSection health={{ status: 'Stale', lastPollAt: new Date('2026-10-26T14:44:00Z') }} />);

        expect(screen.getByText('Sem leitura recente')).toBeInTheDocument();
        expect(screen.getByText('Last Poll: Oct 26, 14:44 UTC')).toBeInTheDocument();
        expect(screen.queryByTestId('hero-highlight')).not.toBeInTheDocument();
        expect(screen.queryByText('Critical')).not.toBeInTheDocument();
    });

    it('Stale Snapshot sem nenhum Poll registrado diz que ainda não houve Poll', () => {
        render(<HeroSection health={{ status: 'Stale', lastPollAt: null }} />);

        expect(screen.getByText('Sem leitura recente')).toBeInTheDocument();
        expect(screen.getByText('No Poll recorded yet.')).toBeInTheDocument();
    });
});
