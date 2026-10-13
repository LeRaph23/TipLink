import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMPETITORS, EXAMPLE, ROWS, SOURCES, TIP_CENTS, VERIFIED } from '@/content/comparatif';
import { computeTipFee } from '@/lib/pricing/tip-fees';

// The comparison names competitors, so it has to stay objective and verifiable
// (art. L122-1 code de la consommation). These checks keep the sourcing and the
// worked example from drifting as the table is edited.

describe('comparison page data', () => {
  it('fills every cell for every competitor', () => {
    for (const row of ROWS) {
      for (const c of COMPETITORS) {
        expect(row.others[c.key], `${row.criterion} / ${c.name}`).toBeDefined();
        expect(row.others[c.key].text.trim().length).toBeGreaterThan(1);
      }
    }
  });

  it('sources every competitor', () => {
    for (const c of COMPETITORS) {
      expect(c.sources.length, c.name).toBeGreaterThan(0);
      for (const k of c.sources) expect(SOURCES[k].url).toMatch(/^https:\/\//);
    }
  });

  it('dates every source', () => {
    for (const s of Object.values(SOURCES)) expect(s.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(VERIFIED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches the published rates in the 10 € example', () => {
    const byKey = Object.fromEntries(EXAMPLE.map((e) => [e.key, e]));
    // Onetip: 4 % commission, plus bank fees of up to 5 %.
    expect(byKey.onetip.teamMax).toBe(TIP_CENTS * 0.96);
    expect(byKey.onetip.team).toBe(TIP_CENTS * 0.91);
    // Tipsi: 8 %. Tap Tiiip: their own 10 € example, 9,10 €.
    expect(byKey.tipsi.team).toBe(TIP_CENTS * 0.92);
    expect(byKey.taptiiip.team).toBe(910);
  });

  it('uses Digitip’s real fee for its own row', () => {
    const us = EXAMPLE.find((e) => e.key === 'digitip')!;
    expect(us.team).toBe(TIP_CENTS);
    expect(us.customerPays - TIP_CENTS).toBe(computeTipFee(TIP_CENTS));
  });

  it('links the full page from the landing teaser and the footer', () => {
    const landing = readFileSync(join(process.cwd(), 'components', 'landing', 'LandingPage.tsx'), 'utf8');
    expect(landing.match(/'\/pourquoi-digitip'|"\/pourquoi-digitip"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
