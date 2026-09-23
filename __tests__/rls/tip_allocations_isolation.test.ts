/**
 * RLS — tip_allocations read access.
 *
 * The table used to carry only the super-admin policy, so every dashboard read
 * made with a user session returned nothing: an employee saw 0 € and the
 * manager's overview and analytics stayed empty while money was being paid.
 * An employee must see their own share, a group admin the shares of their
 * establishments, and nobody another group's.
 *
 * Prerequisites:
 *   - Run: npx supabase start
 *   - Set SUPABASE_LOCAL_SERVICE_KEY and SUPABASE_LOCAL_ANON_KEY env vars
 *
 * Run: npm run test:rls
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://localhost:54321';
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? '';
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY ?? '';

const skipIfNoLocal = !SERVICE_KEY || !ANON_KEY;
const PASSWORD = 'test-password-rls-123';

describe.skipIf(skipIfNoLocal)('tip_allocations RLS', () => {
  const service = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const groupIds: string[] = [];
  const estIds: string[] = [];
  const txnIds: string[] = [];
  const userIds: string[] = [];
  let allocAId: string;
  let allocBId: string;
  let adminAEmail: string;
  let staffAEmail: string;

  async function mkUser(label: string) {
    const email = `alloc-rls-${label}-${stamp}@test.local`;
    const { data: { user } } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    userIds.push(user!.id);
    return { email, id: user!.id };
  }

  async function mkTenant(label: string) {
    const { data: g } = await service.from('groups').insert({ name: `Alloc ${label}`, settings: {} }).select('id').single();
    groupIds.push(g!.id);
    const { data: e } = await service
      .from('establishments')
      .insert({ group_id: g!.id, name: label, business_type: 'restaurant', slug: `alloc-rls-${label}-${stamp}`, country: 'FR', currency: 'EUR' })
      .select('id')
      .single();
    estIds.push(e!.id);
    const staffUser = await mkUser(`staff-${label}`);
    const { data: s } = await service
      .from('staff_profiles')
      .insert({ establishment_id: e!.id, user_id: staffUser.id, full_name: `Staff ${label}`, is_active: true })
      .select('id')
      .single();
    const { data: t } = await service
      .from('transactions')
      .insert({ amount: 1075, currency: 'EUR', establishment_id: e!.id, staff_id: s!.id, status: 'succeeded', idempotency_key: `alloc-rls-${label}-${stamp}` })
      .select('id')
      .single();
    txnIds.push(t!.id);
    const { data: a } = await service
      .from('tip_allocations')
      .insert({ transaction_id: t!.id, staff_id: s!.id, amount: 1000, status: 'allocated', allocated_at: new Date().toISOString() })
      .select('id')
      .single();
    return { groupId: g!.id as string, staffEmail: staffUser.email, allocId: a!.id as string };
  }

  beforeAll(async () => {
    const a = await mkTenant('a');
    const b = await mkTenant('b');
    allocAId = a.allocId;
    allocBId = b.allocId;
    staffAEmail = a.staffEmail;
    const adminA = await mkUser('admin-a');
    adminAEmail = adminA.email;
    await service.from('user_roles').insert({ user_id: adminA.id, role: 'group_admin', group_id: a.groupId });
  });

  afterAll(async () => {
    await service.from('tip_allocations').delete().in('id', [allocAId, allocBId].filter(Boolean));
    await service.from('transactions').delete().in('id', txnIds);
    await service.from('staff_profiles').delete().in('establishment_id', estIds);
    await service.from('establishments').delete().in('id', estIds);
    await service.from('groups').delete().in('id', groupIds);
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  async function signedIn(email: string) {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw new Error(`signIn failed: ${error.message}`);
    return client;
  }

  it('an employee reads their own allocation, not another group\'s', async () => {
    const client = await signedIn(staffAEmail);
    const { data } = await client.from('tip_allocations').select('id').in('id', [allocAId, allocBId]);
    expect((data ?? []).map((r) => r.id)).toEqual([allocAId]);
  });

  it('a group admin reads their establishments\' allocations, not another group\'s', async () => {
    const client = await signedIn(adminAEmail);
    const { data } = await client.from('tip_allocations').select('id').in('id', [allocAId, allocBId]);
    expect((data ?? []).map((r) => r.id)).toEqual([allocAId]);
  });
});
