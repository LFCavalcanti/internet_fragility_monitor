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
});
