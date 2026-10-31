import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusCard } from '@/components/status-card';
import type { ProviderStatusDecision } from '@/lib/provider-status';
import { hoursBefore } from '../helpers/time';

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

// Relógio fixo: a página passa a hora do servidor ao card, que não lê o relógio na renderização.
const now = new Date('2026-10-28T12:00:00Z');

describe('StatusCard', () => {
    const baseProps = {
        now,
        lastUpdated: hoursBefore(now, 0.1),
        name: 'AWS',
        logo: '/logos/aws.svg',
        statusPageUrl: 'https://status.aws.amazon.com',
    };

    const createDecision = (overrides: Partial<ProviderStatusDecision> = {}): ProviderStatusDecision => ({
        status: 'operational',
        incidents: [],
        upcomingMaintenance: null,
        accessOnly: false,
        partialReading: null,
        ...overrides,
    });

    const renderCard = (decision: Partial<ProviderStatusDecision> = {}, props: Partial<typeof baseProps> = {}) =>
        render(<StatusCard {...baseProps} {...props} decision={createDecision(decision)} />);

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

    it('Provider só com Probes mostra a marca "verificação de acesso, sem feed de status" junto do estado', () => {
        renderCard({ status: 'operational', accessOnly: true });
        expect(screen.getByText('operational')).toBeInTheDocument();
        expect(screen.getByText('verificação de acesso, sem feed de status')).toBeInTheDocument();
    });

    it('Provider com Feed não mostra a marca de "só acesso"', () => {
        renderCard({ status: 'operational' });
        expect(screen.queryByText(/verificação de acesso/)).not.toBeInTheDocument();
    });

    it('Partial Reading mostra a marca "1 de 2 feeds sem leitura" junto do estado', () => {
        renderCard({ status: 'degraded', partialReading: { unread: 1, total: 2 } });
        expect(screen.getByText('degraded')).toBeInTheDocument();
        expect(screen.getByText('1 de 2 feeds sem leitura')).toBeInTheDocument();
    });

    it('sem Partial Reading não há marca', () => {
        renderCard({ status: 'operational' });
        expect(screen.queryByText(/sem leitura/)).not.toBeInTheDocument();
    });

    it('sem Upcoming Maintenance não há linha', () => {
        renderCard();
        expect(screen.queryByText(/upcoming maintenance/)).not.toBeInTheDocument();
    });

    it('mostra os Recent Incidents recebidos do módulo', () => {
        renderCard({
            status: 'degraded',
            incidents: [{
                kind: 'problem',
                title: 'API Latency Issues',
                status: 'investigating',
                createdAt: hoursBefore(now, 1),
            }],
        });
        expect(screen.getByText('API Latency Issues')).toBeInTheDocument();
        expect(screen.getByText('Recent Incidents')).toBeInTheDocument();
    });

    it('mostra a manutenção em andamento na lista com a fase legível', () => {
        renderCard({
            status: 'maintenance',
            incidents: [{
                kind: 'maintenance',
                title: 'Network upgrade',
                status: 'in_progress',
                createdAt: hoursBefore(now, 24 * 6),
            }],
        });
        expect(screen.getByText('Network upgrade')).toBeInTheDocument();
        expect(screen.getByText('in progress')).toBeInTheDocument();
    });

    it('sem Recent Incidents não há lista', () => {
        renderCard();
        expect(screen.queryByText('Recent Incidents')).not.toBeInTheDocument();
    });

    describe('Unreachable', () => {
        it('card cinza e neutro com "Não foi possível ler a status page"', () => {
            const { container } = renderCard({ status: 'unreachable' });

            expect(screen.getByText('Não foi possível ler a status page')).toBeInTheDocument();
            expect(screen.getByRole('img', { name: 'unreachable' })).toHaveClass('text-muted-foreground');
            const card = container.firstElementChild;
            expect(card).toHaveAttribute('data-status', 'unreachable');
            expect(card).toHaveClass('grayscale');
        });

        it('não mostra o último status conhecido nem o tempo de resposta', () => {
            render(
                <StatusCard
                    {...baseProps}
                    decision={createDecision({ status: 'unreachable' })}
                />
            );
            for (const status of ['operational', 'degraded', 'outage', 'maintenance']) {
                expect(screen.queryByText(status)).not.toBeInTheDocument();
            }
            expect(screen.queryByText(/latency/)).not.toBeInTheDocument();
        });

        it('continua mostrando os Recent Incidents gravados, com suas datas', () => {
            renderCard({
                status: 'unreachable',
                incidents: [{
                    kind: 'problem',
                    title: 'Elevated errors',
                    status: 'identified',
                    createdAt: hoursBefore(now, 2),
                }],
            });
            expect(screen.getByText('Elevated errors')).toBeInTheDocument();
            expect(screen.getByText('about 2 hours ago')).toBeInTheDocument();
        });

        it('os outros estados não usam o texto nem o cinza de Unreachable', () => {
            const { container } = renderCard({ status: 'outage' });
            expect(screen.queryByText('Não foi possível ler a status page')).not.toBeInTheDocument();
            expect(container.firstElementChild).not.toHaveClass('grayscale');
        });
    });

    describe('Down', () => {
        it('card com a cor mais forte da página e "Sem resposta da status page nem do serviço"', () => {
            const { container } = renderCard({ status: 'down' });

            expect(screen.getByText('Sem resposta da status page nem do serviço')).toBeInTheDocument();
            expect(screen.getByRole('img', { name: 'down' })).toHaveClass('text-red-700');
            const card = container.firstElementChild;
            expect(card).toHaveAttribute('data-status', 'down');
            expect(card).toHaveClass('border-red-700');
            expect(card).not.toHaveClass('grayscale');
        });

        it('os outros estados não usam o texto nem a cor de Down', () => {
            const { container } = renderCard({ status: 'outage' });

            expect(screen.queryByText('Sem resposta da status page nem do serviço')).not.toBeInTheDocument();
            expect(container.firstElementChild).not.toHaveClass('border-red-700');
        });

        it('não usa o texto de Unreachable', () => {
            renderCard({ status: 'down' });

            expect(screen.queryByText('Não foi possível ler a status page')).not.toBeInTheDocument();
        });

        it('continua mostrando os Recent Incidents gravados', () => {
            renderCard({
                status: 'down',
                incidents: [{ kind: 'problem', title: 'Elevated errors', status: 'identified', createdAt: hoursBefore(now, 2) }],
            });

            expect(screen.getByText('Elevated errors')).toBeInTheDocument();
        });

        it('Provider só com Probes em Down mantém a marca "verificação de acesso, sem feed de status"', () => {
            renderCard({ status: 'down', accessOnly: true });

            expect(screen.getByText('Sem resposta da status page nem do serviço')).toBeInTheDocument();
            expect(screen.getByText('verificação de acesso, sem feed de status')).toBeInTheDocument();
        });
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
                now={now}
                decision={createDecision()}
            />
        );
        expect(screen.getByText('Test Provider')).toBeInTheDocument();
        expect(screen.queryByTitle('Visit Status Page')).not.toBeInTheDocument();
    });

    it('exibe todos os Incidents recebidos, na ordem do módulo, com a idade contada do relógio recebido', () => {
        renderCard({
            status: 'outage',
            incidents: [1, 2, 3, 4, 5].map(h => ({
                kind: 'problem' as const,
                title: `Incident ${h}`,
                status: 'investigating' as const,
                createdAt: hoursBefore(now, 24 * h),
            })),
        });
        const titles = screen.getAllByText(/^Incident \d$/).map(el => el.textContent);
        expect(titles).toEqual(['Incident 1', 'Incident 2', 'Incident 3', 'Incident 4', 'Incident 5']);
        expect(screen.getByText('5 days ago')).toBeInTheDocument();
    });
});
