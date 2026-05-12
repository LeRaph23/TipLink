import { describe, it, expect } from 'vitest';
import { generateReferralCode } from '@/lib/referrals';

describe('generateReferralCode', () => {
  it('starts with AMB- prefix', () => {
    const code = generateReferralCode('Lucas');
    expect(code.startsWith('AMB-')).toBe(true);
  });

  it('uppercases the name slug', () => {
    const code = generateReferralCode('lucas');
    expect(code).toMatch(/^AMB-LUCAS-[A-Z0-9]{3}$/);
  });

  it('strips diacritics', () => {
    const code = generateReferralCode('Léa Hervé');
    expect(code).toMatch(/^AMB-LEAHERVE-[A-Z0-9]{3}$/);
  });

  it('strips non-alpha characters', () => {
    const code = generateReferralCode('Jean-Marc D2');
    expect(code).toMatch(/^AMB-JEANMARC-[A-Z0-9]{3}$/);
  });

  it('truncates long names to 8 chars', () => {
    const code = generateReferralCode('Alexandrina');
    expect(code).toMatch(/^AMB-ALEXANDR-[A-Z0-9]{3}$/);
  });

  it('falls back to AMBA when no letters left', () => {
    const code = generateReferralCode('123');
    expect(code).toMatch(/^AMB-AMBA-[A-Z0-9]{3}$/);
  });

  it('produces different random suffixes', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateReferralCode('Test')));
    expect(codes.size).toBeGreaterThan(1);
  });
});
