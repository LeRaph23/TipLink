import { describe, it, expect } from 'vitest';
import { signTeamJoinToken, verifyTeamJoinToken } from '@/lib/auth/team-join-token';
import { signOnboardingToken } from '@/lib/auth/onboarding-token';

const EST_A = '11111111-2222-3333-4444-555555555555';
const EST_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('signTeamJoinToken / verifyTeamJoinToken', () => {
  it('round-trips a valid token', () => {
    const token = signTeamJoinToken(EST_A, 1);
    const v = verifyTeamJoinToken(token, EST_A, 1);
    expect(v.valid).toBe(true);
    if (v.valid) {
      expect(v.establishmentId).toBe(EST_A);
      expect(v.version).toBe(1);
      expect(v.exp).toBeGreaterThan(Date.now());
    }
  });

  // The reason this scheme exists: the establishment id is public, so a token
  // that did not name one would let a link for any salon join any other.
  it('refuses a token minted for a different establishment', () => {
    const token = signTeamJoinToken(EST_A, 1);
    const v = verifyTeamJoinToken(token, EST_B, 1);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('establishment_mismatch');
  });

  it('refuses a token whose version has been rotated', () => {
    const token = signTeamJoinToken(EST_A, 1);
    // The manager regenerated the link; establishments.team_join_version is 2.
    const v = verifyTeamJoinToken(token, EST_A, 2);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('revoked');
  });

  it('accepts the token minted after a rotation', () => {
    const rotated = signTeamJoinToken(EST_A, 2);
    expect(verifyTeamJoinToken(rotated, EST_A, 2).valid).toBe(true);
  });

  it('refuses an expired token', () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const token = signTeamJoinToken(EST_A, 1, thirtyOneDaysAgo);
    const v = verifyTeamJoinToken(token, EST_A, 1);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('expired');
  });

  it('refuses a tampered signature', () => {
    const token = signTeamJoinToken(EST_A, 1);
    const v = verifyTeamJoinToken(token.slice(0, -2) + 'xx', EST_A, 1);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('bad_signature');
  });

  it('refuses a tampered payload', () => {
    // Re-encode the payload for a different establishment, keeping the original
    // signature. Must fail on the signature, before anything is decoded.
    const token = signTeamJoinToken(EST_A, 1);
    const sig = token.slice(token.lastIndexOf('.') + 1);
    const forged = Buffer.from(`${EST_B}|1|${Date.now() + 1000}`, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const v = verifyTeamJoinToken(`${forged}.${sig}`, EST_B, 1);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('bad_signature');
  });

  it('refuses malformed input', () => {
    for (const bad of ['', 'no-dot-here', null, undefined, '.', 'a.']) {
      expect(verifyTeamJoinToken(bad as string | null, EST_A, 1).valid).toBe(false);
    }
  });

  // Both schemes sign with ONBOARDING_TOKEN_SECRET. The `team:` purpose tag is
  // what stops an onboarding token, which grants group_admin over a whole
  // group, from being replayed here as a team-join token.
  it('refuses an onboarding token signed with the same secret', () => {
    const onboarding = signOnboardingToken(EST_A, 'manager@example.com');
    const v = verifyTeamJoinToken(onboarding, EST_A, 1);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe('bad_signature');
  });
});
