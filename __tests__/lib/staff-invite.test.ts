/**
 * sendStaffInviteLink when the invited address already has an account.
 *
 * Supabase's invite link can only create users. A salon owner invited a
 * colleague who had signed up days earlier by scanning the tag: generateLink
 * answered "email_exists", the helper gave up, and the form still said the
 * invite had been sent. The colleague never heard of it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendStaffInviteEmail = vi.fn();
vi.mock('@/lib/email', () => ({ sendStaffInviteEmail: (...a: unknown[]) => sendStaffInviteEmail(...a) }));
vi.mock('@/lib/env', () => ({ getBaseUrl: () => 'https://digitip.test' }));

import { sendStaffInviteLink } from '@/lib/staff-invite';

const PARAMS = {
  staffProfileId: 'profile-1',
  fullName: 'Julien',
  email: 'julien@example.com',
  establishmentId: 'est-1',
  establishmentName: 'City Cut',
  role: 'staff' as const,
  locale: 'fr' as const,
};

function serviceMock(opts: {
  inviteError?: { message: string; code?: string } | null;
  profileError?: { code: string } | null;
}) {
  const generateLink = vi.fn(async ({ type }: { type: string }) => {
    if (type === 'invite' && opts.inviteError) return { data: null, error: opts.inviteError };
    return { data: { user: { id: 'user-1' }, properties: { hashed_token: `hash-${type}` } }, error: null };
  });
  const profileUpdates: unknown[] = [];
  const roleInserts: unknown[] = [];
  const from = vi.fn((table: string) => {
    if (table === 'staff_profiles') {
      return {
        update: (patch: unknown) => {
          profileUpdates.push(patch);
          return { eq: async () => ({ error: opts.profileError ?? null }) };
        },
      };
    }
    return {
      insert: async (row: unknown) => {
        roleInserts.push(row);
        return { error: null };
      },
    };
  });
  const service = { auth: { admin: { generateLink } }, from } as never;
  return { service, generateLink, profileUpdates, roleInserts };
}

describe('sendStaffInviteLink', () => {
  beforeEach(() => {
    sendStaffInviteEmail.mockReset().mockResolvedValue({ ok: true });
  });

  it('invites a new address and pre-creates its role', async () => {
    const m = serviceMock({});
    const res = await sendStaffInviteLink(m.service, PARAMS);
    expect(res).toEqual({ invited: true, linked: true });
    expect(m.roleInserts).toEqual([{ user_id: 'user-1', role: 'staff', establishment_id: 'est-1' }]);
    expect(sendStaffInviteEmail.mock.calls[0][0].inviteUrl).toContain('type=invite');
  });

  it('sends a magic link to an address that already has an account', async () => {
    const m = serviceMock({ inviteError: { message: 'A user with this email address has already been registered', code: 'email_exists' } });
    const res = await sendStaffInviteLink(m.service, PARAMS);

    expect(res).toEqual({ invited: true, linked: true });
    expect(m.generateLink.mock.calls.map((c) => c[0].type)).toEqual(['invite', 'magiclink']);
    expect(m.profileUpdates).toEqual([{ user_id: 'user-1' }]);
    const url = new URL(sendStaffInviteEmail.mock.calls[0][0].inviteUrl);
    expect(url.searchParams.get('type')).toBe('email');
    expect(url.searchParams.get('token_hash')).toBe('hash-magiclink');
    expect(url.searchParams.get('next')).toBe('/join/est-1');
  });

  it('grants an existing account no role until it joins', async () => {
    const m = serviceMock({ inviteError: { message: 'already been registered' } });
    await sendStaffInviteLink(m.service, PARAMS);
    expect(m.roleInserts).toEqual([]);
  });

  it('reports failure when the profile cannot be linked', async () => {
    const m = serviceMock({ inviteError: { message: 'x', code: 'email_exists' }, profileError: { code: '23505' } });
    const res = await sendStaffInviteLink(m.service, PARAMS);
    expect(res).toEqual({ invited: false, linked: false });
    expect(sendStaffInviteEmail).not.toHaveBeenCalled();
  });

  it('still gives up on other invite errors', async () => {
    const m = serviceMock({ inviteError: { message: 'rate limit', code: 'over_email_send_rate_limit' } });
    const res = await sendStaffInviteLink(m.service, PARAMS);
    expect(res).toEqual({ invited: false, linked: false });
    expect(m.generateLink).toHaveBeenCalledTimes(1);
  });
});
