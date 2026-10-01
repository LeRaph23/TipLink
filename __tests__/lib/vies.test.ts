import { describe, it, expect } from 'vitest';
import { splitVatNumber, parseViesResponse } from '@/lib/tax/vies';

describe('splitVatNumber', () => {
  it('normalises spacing and punctuation', () => {
    expect(splitVatNumber('be 0123.456.789')).toEqual({ country: 'BE', number: '0123456789' });
  });
  it('uses EL for Greece, as VIES does', () => {
    expect(splitVatNumber('GR123456789')).toEqual({ country: 'EL', number: '123456789' });
  });
  it('rejects garbage', () => {
    expect(splitVatNumber('1234')).toBeNull();
  });
});

describe('parseViesResponse', () => {
  it('reads valid and invalid answers', () => {
    expect(parseViesResponse({ isValid: true, userError: 'VALID' })).toBe('valid');
    expect(parseViesResponse({ isValid: false, userError: 'INVALID' })).toBe('invalid');
  });
  it('treats an outage as unavailable, never as invalid', () => {
    expect(parseViesResponse({ isValid: false, userError: 'MS_UNAVAILABLE' })).toBe('unavailable');
    expect(parseViesResponse(null)).toBe('unavailable');
  });
});
