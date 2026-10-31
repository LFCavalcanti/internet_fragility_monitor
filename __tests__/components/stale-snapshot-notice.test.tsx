import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StaleSnapshotNotice } from '@/components/stale-snapshot-notice';

describe('StaleSnapshotNotice', () => {
    it('avisa que os cards podem estar desatualizados, com a hora do último Poll', () => {
        render(<StaleSnapshotNotice lastPollAt={new Date('2026-10-26T14:44:00Z')} />);

        expect(screen.getByRole('status')).toHaveTextContent(
            'No recent reading. The provider cards may be out of date. Last Poll: Oct 26, 14:44 UTC',
        );
    });

    it('sem nenhum Poll registrado, avisa sem hora', () => {
        render(<StaleSnapshotNotice lastPollAt={null} />);

        expect(screen.getByRole('status')).toHaveTextContent(
            'No recent reading. The provider cards may be out of date. No Poll recorded yet.',
        );
    });
});
