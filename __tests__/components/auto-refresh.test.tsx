import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { AutoRefresh } from '@/components/auto-refresh';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const MINUTE = 60 * 1000;

describe('AutoRefresh', () => {
    beforeEach(() => {
        refresh.mockReset();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('pede uma nova renderização no ritmo da cadência que a página entrega', () => {
        render(<AutoRefresh cadenceMs={7 * MINUTE} />);

        vi.advanceTimersByTime(7 * MINUTE - 1);
        expect(refresh).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(refresh).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(7 * MINUTE);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('para de atualizar ao sair da página', () => {
        const { unmount } = render(<AutoRefresh cadenceMs={7 * MINUTE} />);

        unmount();
        vi.advanceTimersByTime(14 * MINUTE);

        expect(refresh).not.toHaveBeenCalled();
    });
});
