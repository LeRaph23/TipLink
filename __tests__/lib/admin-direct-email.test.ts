import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateDirectEmail } from '@/lib/admin/direct-email';

const sendDirectEmail = vi.fn();
const getUser = vi.fn();
const roles = vi.fn();

vi.mock('@/lib/email', () => ({ sendDirectEmail: (...a: unknown[]) => sendDirectEmail(...a) }));
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: async () => ({ data: roles() }) }) }),
  }),
}));

import { sendAdminDirectEmail } from '@/actions/admin/emails';

describe('validateDirectEmail', () => {
  it('normalises a valid message', () => {
    expect(validateDirectEmail({ to: ' Julien@Example.com ', subject: ' Bonjour ', body: ' Un message ' })).toEqual({
      ok: true,
      value: { to: 'julien@example.com', subject: 'Bonjour', body: 'Un message' },
    });
  });

  it.each([
    [{ to: 'pas-une-adresse', subject: 'Bonjour', body: 'Un message' }],
    [{ to: 'a@b.co', subject: 'Yo', body: 'Un message' }],
    [{ to: 'a@b.co', subject: 'Bonjour', body: 'Hey' }],
    [{ to: 42, subject: 'Bonjour', body: 'Un message' }],
  ])('rejects %j', (input) => {
    expect(validateDirectEmail(input).ok).toBe(false);
  });
});

describe('sendAdminDirectEmail', () => {
  beforeEach(() => {
    sendDirectEmail.mockReset().mockResolvedValue({ id: 're_1' });
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } });
    roles.mockReset();
  });

  it('refuses anyone who is not super admin', async () => {
    roles.mockReturnValue([{ role: 'group_admin' }]);
    const res = await sendAdminDirectEmail('a@b.co', 'Bonjour', 'Un message');
    expect(res).toEqual({ ok: false, error: 'Forbidden' });
    expect(sendDirectEmail).not.toHaveBeenCalled();
  });

  it('refuses a visitor with no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await sendAdminDirectEmail('a@b.co', 'Bonjour', 'Un message');
    expect(res.ok).toBe(false);
    expect(sendDirectEmail).not.toHaveBeenCalled();
  });

  it('sends for a super admin', async () => {
    roles.mockReturnValue([{ role: 'super_admin' }]);
    const res = await sendAdminDirectEmail('Julien@Example.com', 'Bonjour', 'Un message');
    expect(res).toEqual({ ok: true, data: { to: 'julien@example.com' } });
    expect(sendDirectEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'julien@example.com', subject: 'Bonjour' }));
  });

  it('reports a refused send', async () => {
    roles.mockReturnValue([{ role: 'super_admin' }]);
    sendDirectEmail.mockRejectedValue(new Error('domain not verified'));
    const res = await sendAdminDirectEmail('a@b.co', 'Bonjour', 'Un message');
    expect(res).toEqual({ ok: false, error: 'domain not verified' });
  });
});
