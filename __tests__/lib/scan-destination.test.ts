import { describe, it, expect } from 'vitest';
import { scanDestination, maskEmail } from '@/lib/nfc/scan-destination';

describe('scanDestination', () => {
  it('sends an unknown tag to not-found', () => {
    expect(scanDestination([])).toEqual({ kind: 'not_found' });
  });

  it('sends a stock tag to onboarding', () => {
    expect(scanDestination([{ establishment_id: null }])).toEqual({ kind: 'onboarding' });
  });

  it('sends a plaque bought online but not activated to onboarding', () => {
    expect(
      scanDestination([{ establishment_id: 'e1', group_id: 'g1', group_onboarded: false }]),
    ).toEqual({ kind: 'onboarding' });
  });

  it('sends an activated plaque to the tip page', () => {
    expect(
      scanDestination([{ establishment_id: 'e1', group_id: 'g1', group_onboarded: true }]),
    ).toEqual({ kind: 'tip', establishmentId: 'e1' });
  });

  it('keeps the tip page when the resolver predates migration 00086', () => {
    expect(scanDestination([{ establishment_id: 'e1' }])).toEqual({ kind: 'tip', establishmentId: 'e1' });
  });

  it('does not treat a tag on a deleted establishment as awaiting setup', () => {
    // The resolver returns group_onboarded NULL when the group is gone.
    expect(
      scanDestination([{ establishment_id: 'e1', group_id: null, group_onboarded: null }]),
    ).toEqual({ kind: 'tip', establishmentId: 'e1' });
  });
});

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('mohamed@gmail.com')).toBe('m•••@gmail.com');
  });
  it('never echoes a malformed address', () => {
    expect(maskEmail('nope')).toBe('•••');
  });
});
