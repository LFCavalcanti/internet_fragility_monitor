// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatUtc, formatLastPoll } from '@/lib/format-utc';

describe('formatUtc', () => {
    it('mostra dia e hora em UTC, em 24 horas', () => {
        expect(formatUtc(new Date('2026-10-26T14:44:00Z'))).toBe('Oct 26, 14:44 UTC');
    });

    it('meia-noite UTC aparece como 00:00, nunca 24:00', () => {
        expect(formatUtc(new Date('2026-10-27T00:00:00Z'))).toBe('Oct 27, 00:00 UTC');
        expect(formatUtc(new Date('2026-10-27T00:30:00Z'))).toBe('Oct 27, 00:30 UTC');
    });
});

describe('formatLastPoll', () => {
    it('hora do último Poll em UTC', () => {
        expect(formatLastPoll(new Date('2026-10-27T00:05:00Z'))).toBe('Last Poll: Oct 27, 00:05 UTC');
    });

    it('sem nenhum Poll registrado', () => {
        expect(formatLastPoll(null)).toBe('No Poll recorded yet.');
    });
});
