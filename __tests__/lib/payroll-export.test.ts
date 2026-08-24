/**
 * Payroll export rendering.
 *
 * These files land in an accountant's inbox and get typed into payroll, so the
 * two things that matter are that Excel opens them without mangling accents,
 * and that a name containing a comma or a quote doesn't shift every column.
 */
import { describe, it, expect } from 'vitest';
import {
  csvCell,
  journalCsv,
  monthPeriod,
  previousMonth,
  summaryCsv,
  toCsv,
} from '@/lib/export/payroll';

describe('csvCell', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('Marie')).toBe('Marie');
    expect(csvCell(12)).toBe('12');
  });

  it('quotes and escapes anything that would break the column layout', () => {
    expect(csvCell('Dupont, Marie')).toBe('"Dupont, Marie"');
    expect(csvCell('L\'"Atelier"')).toBe('"L\'""Atelier"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });
});

describe('toCsv', () => {
  it('emits a BOM and CRLF so Excel reads accents correctly', () => {
    const csv = toCsv(['A'], [['é']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
  });
});

describe('summaryCsv', () => {
  it('renders one line per employee, in euros', () => {
    const csv = summaryCsv({
      period: { start: '', end: '', label: '2026-07' },
      summary: [
        { staffId: 's1', name: 'Marie Dupont', count: 12, amountCents: 4530 },
        { staffId: 's2', name: 'Léa, Martin', count: 3, amountCents: 900 },
      ],
      totals: { count: 15, amountCents: 5430 },
    });

    const lines = csv.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Employe,Periode,Nb pourboires,Montant a verser (EUR)');
    expect(lines[1]).toBe('Marie Dupont,2026-07,12,45.30');
    // The comma in the name must not become a column separator.
    expect(lines[2]).toBe('"Léa, Martin",2026-07,3,9.00');
  });

  it('renders a header even with nothing to report', () => {
    const csv = summaryCsv({
      period: { start: '', end: '', label: '2026-07' },
      summary: [],
      totals: { count: 0, amountCents: 0 },
    });
    expect(csv.replace('﻿', '').trim().split('\r\n')).toHaveLength(1);
  });
});

describe('journalCsv', () => {
  it('separates the employee share from what the customer actually paid', () => {
    const csv = journalCsv([
      {
        date: '2026-07-14',
        staffName: 'Marie',
        tipCents: 250,
        feeCents: 50,
        totalCents: 550,
        reference: 'txn-1',
      },
    ]);
    const lines = csv.replace('﻿', '').trim().split('\r\n');
    // 5,00 € tip split in two, 0,50 € of fee, 5,50 € debited.
    expect(lines[1]).toBe('2026-07-14,Marie,2.50,0.50,5.50,txn-1');
  });
});

describe('period helpers', () => {
  it('bounds a month on UTC, half-open so no tip is counted twice', () => {
    const p = monthPeriod('2026-02');
    expect(p.start).toBe('2026-02-01T00:00:00.000Z');
    expect(p.end).toBe('2026-03-01T00:00:00.000Z');
  });

  it('rolls back across a year boundary', () => {
    expect(previousMonth(new Date('2026-01-15T00:00:00Z'))).toBe('2025-12');
    expect(previousMonth(new Date('2026-08-03T00:00:00Z'))).toBe('2026-07');
  });
});
