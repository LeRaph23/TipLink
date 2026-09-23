import { describe, it, expect } from 'vitest';
import { normalizeTrackingNumber, laPosteTrackingUrl } from '@/lib/email';

describe('La Poste tracking link', () => {
  it('strips the spaces and dashes La Poste prints on the receipt', () => {
    expect(normalizeTrackingNumber(' 1l 00 1234 5678-9 ')).toBe('1L0012345678' + '9');
  });

  it('treats a blank field as no tracking number', () => {
    expect(normalizeTrackingNumber('   ')).toBeNull();
    expect(normalizeTrackingNumber(undefined)).toBeNull();
  });

  it('points at the La Poste tracker with the number as the code', () => {
    expect(laPosteTrackingUrl('1L00123456789')).toBe(
      'https://www.laposte.fr/outils/suivre-vos-envois?code=1L00123456789',
    );
  });
});
