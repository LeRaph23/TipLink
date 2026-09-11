/**
 * POST /api/staff/join authorisation tests.
 *
 * The route used to check only that the caller was signed in, then trust the
 * `establishmentId` in the request body. That id is public — it is the href of
 * the "see the team" link on the page every NFC scan lands on — so any account
 * could insert itself as active staff in any establishment, landing on that
 * salon's public tip page, in its payroll export, and in the equal split every
 * group tip is divided by. `selectedProfileId` was worse: it let a stranger
 * claim a colleague's pending invitation and lock the real employee out.
 *
 * These tests pin the three legitimate ways in, and the refusals around them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signTeamJoinToken } from '@/lib/auth/team-join-token';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }));

const EST = '11111111-2222-3333-4444-555555555555';
const OTHER_EST = '99999999-8888-7777-6666-555555555555';
const ME = 'user-me';
const COLLEAGUE = 'user-colleague';

type Profile = { id: string; user_id: string | null; is_active: boolean } | null;

function buildRequest(body: unknown) {
  return new Request('https://test.example.com/api/staff/join', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Minimal stand-in for the chained PostgREST builder. Each table returns a
 * thenable chain whose terminal method resolves to the fixture below.
 */
function serviceMock(opts: {
  establishment?: { id: string; group_id: string } | null;
  teamJoinVersion?: number;
  role?: { id: string } | null;
  profile?: Profile;
  ownProfileElsewhere?: { id: string } | null;
  insertError?: { code: string } | null;
}) {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];

  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'not', 'order', 'limit']) {
      c[m] = vi.fn(() => c);
    }
    c.single = vi.fn().mockResolvedValue(result);
    c.maybeSingle = vi.fn().mockResolvedValue(result);
    return c;
  };

  const from = vi.fn((table: string) => {
    if (table === 'establishments') {
      // Two different reads hit this table: the establishment lookup and the
      // tolerant team_join_version read.
      const c = chain({ data: opts.establishment ?? null, error: null }) as Record<string, unknown>;
      c.maybeSingle = vi.fn().mockResolvedValue({
        data: { team_join_version: opts.teamJoinVersion ?? 1 },
        error: null,
      });
      return c;
    }
    if (table === 'user_roles') {
      const c = chain({ data: opts.role ?? null, error: null }) as Record<string, unknown>;
      c.insert = vi.fn((row: Record<string, unknown>) => {
        inserted.push({ table, ...row });
        return Promise.resolve({ data: null, error: null });
      });
      return c;
    }
    if (table === 'staff_profiles') {
      let selectCall = 0;
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'order', 'limit']) c[m] = vi.fn(() => c);
      c.maybeSingle = vi.fn().mockImplementation(() => {
        selectCall += 1;
        // First read is the selectedProfile lookup; a later one is the
        // "does this user already have a profile" guard.
        return Promise.resolve({
          data: selectCall === 1 ? opts.profile ?? null : opts.ownProfileElsewhere ?? null,
          error: null,
        });
      });
      c.single = vi.fn().mockResolvedValue({
        data: opts.insertError ? null : { id: 'new-profile' },
        error: opts.insertError ?? null,
      });
      c.update = vi.fn((row: Record<string, unknown>) => {
        updated.push(row);
        const u: Record<string, unknown> = {};
        for (const m of ['eq', 'is']) u[m] = vi.fn(() => u);
        u.select = vi.fn().mockResolvedValue({ data: [{ id: opts.profile?.id }], error: null });
        return u;
      });
      c.insert = vi.fn((row: Record<string, unknown>) => {
        inserted.push({ table, ...row });
        return c;
      });
      return c;
    }
    return chain({ data: null, error: null });
  });

  return { from, inserted, updated };
}

async function callRoute(body: unknown, user: { id: string } | null, svc: ReturnType<typeof serviceMock>) {
  const { createClient } = await import('@/lib/supabase/server');
  const { createServiceClient } = await import('@/lib/supabase/service');
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as never);
  vi.mocked(createServiceClient).mockReturnValue(svc as never);
  const { POST } = await import('@/app/api/staff/join/route');
  return POST(buildRequest(body) as never);
}

const establishment = { id: EST, group_id: 'group-1' };

describe('POST /api/staff/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('refuses an anonymous caller', async () => {
    const svc = serviceMock({ establishment });
    const res = await callRoute({ establishmentId: EST, fullName: 'X' }, null, svc);
    expect(res.status).toBe(401);
  });

  // The original hole: signed in, no invitation, no link, arbitrary id.
  it('refuses a signed-in stranger with no invitation and no team link', async () => {
    const svc = serviceMock({ establishment, role: null, profile: null });
    const res = await callRoute({ establishmentId: EST, fullName: 'Free Beer' }, { id: ME }, svc);
    expect(res.status).toBe(403);
    expect(svc.inserted.filter((r) => r.table === 'staff_profiles')).toHaveLength(0);
    expect(svc.inserted.filter((r) => r.table === 'user_roles')).toHaveLength(0);
  });

  it('refuses a team token minted for a different establishment', async () => {
    const svc = serviceMock({ establishment, role: null, profile: null });
    const res = await callRoute(
      { establishmentId: EST, fullName: 'X', teamToken: signTeamJoinToken(OTHER_EST, 1) },
      { id: ME },
      svc,
    );
    expect(res.status).toBe(403);
  });

  it('refuses a team token whose version was rotated', async () => {
    const svc = serviceMock({ establishment, role: null, profile: null, teamJoinVersion: 2 });
    const res = await callRoute(
      { establishmentId: EST, fullName: 'X', teamToken: signTeamJoinToken(EST, 1) },
      { id: ME },
      svc,
    );
    expect(res.status).toBe(403);
  });

  it('accepts a valid team token and creates the profile', async () => {
    const svc = serviceMock({ establishment, role: null, profile: null, ownProfileElsewhere: null });
    const res = await callRoute(
      { establishmentId: EST, fullName: 'Alice', teamToken: signTeamJoinToken(EST, 1) },
      { id: ME },
      svc,
    );
    expect(res.status).toBe(200);
    expect(svc.inserted.some((r) => r.table === 'staff_profiles' && r.user_id === ME)).toBe(true);
  });

  // The invitation-hijack: a pending profile that belongs to someone else.
  it('refuses claiming a colleague pending invitation', async () => {
    const svc = serviceMock({
      establishment,
      role: null,
      profile: { id: 'profile-colleague', user_id: COLLEAGUE, is_active: false },
    });
    const res = await callRoute(
      { establishmentId: EST, selectedProfileId: 'profile-colleague' },
      { id: ME },
      svc,
    );
    expect(res.status).toBe(403);
    expect(svc.updated).toHaveLength(0);
  });

  // ...and a team link does not override that: the profile is already spoken for.
  it('refuses claiming a colleague invitation even with a valid team link', async () => {
    const svc = serviceMock({
      establishment,
      role: null,
      profile: { id: 'profile-colleague', user_id: COLLEAGUE, is_active: false },
    });
    const res = await callRoute(
      {
        establishmentId: EST,
        selectedProfileId: 'profile-colleague',
        teamToken: signTeamJoinToken(EST, 1),
      },
      { id: ME },
      svc,
    );
    expect(res.status).toBe(403);
    expect(svc.updated).toHaveLength(0);
  });

  it('lets an invited employee claim their own pending profile without any token', async () => {
    const svc = serviceMock({
      establishment,
      role: null,
      profile: { id: 'profile-mine', user_id: ME, is_active: false },
    });
    const res = await callRoute(
      { establishmentId: EST, selectedProfileId: 'profile-mine' },
      { id: ME },
      svc,
    );
    expect(res.status).toBe(200);
    expect(svc.updated[0]).toMatchObject({ user_id: ME, is_active: true });
  });

  it('lets a team link claim a profile the manager pre-created without an email', async () => {
    const svc = serviceMock({
      establishment,
      role: null,
      profile: { id: 'profile-unclaimed', user_id: null, is_active: false },
    });
    const res = await callRoute(
      {
        establishmentId: EST,
        selectedProfileId: 'profile-unclaimed',
        teamToken: signTeamJoinToken(EST, 1),
      },
      { id: ME },
      svc,
    );
    expect(res.status).toBe(200);
  });

  it('refuses an unclaimed profile without a team link', async () => {
    const svc = serviceMock({
      establishment,
      role: null,
      profile: { id: 'profile-unclaimed', user_id: null, is_active: false },
    });
    const res = await callRoute(
      { establishmentId: EST, selectedProfileId: 'profile-unclaimed' },
      { id: ME },
      svc,
    );
    expect(res.status).toBe(403);
  });

  it('refuses an already-claimed profile', async () => {
    const svc = serviceMock({
      establishment,
      role: null,
      profile: { id: 'profile-taken', user_id: ME, is_active: true },
    });
    const res = await callRoute(
      { establishmentId: EST, selectedProfileId: 'profile-taken' },
      { id: ME },
      svc,
    );
    expect(res.status).toBe(403);
  });

  it('404s an unknown establishment before any authorisation work', async () => {
    const svc = serviceMock({ establishment: null });
    const res = await callRoute(
      { establishmentId: EST, fullName: 'X', teamToken: signTeamJoinToken(EST, 1) },
      { id: ME },
      svc,
    );
    expect(res.status).toBe(404);
  });
});
