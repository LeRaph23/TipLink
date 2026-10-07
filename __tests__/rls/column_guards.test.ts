/**
 * RLS — column guards (migration 00089).
 *
 * The UPDATE policies scope rows, not columns. Before 00089 a group admin
 * could PATCH his own group through PostgREST with the public anon key and set
 * platform_fee_bps = 0 or plan = 'pro'; a staff member could move his own
 * profile into another establishment. These tests pin the guards: the
 * dangerous writes fail, the everyday ones still go through.
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
const PASSWORD = 'test-password-rls-123';

const skipIfNoLocal = !SERVICE_KEY || !ANON_KEY;

describe.skipIf(skipIfNoLocal)('column guards on groups / establishments / staff_profiles', () => {
  const service = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  const stamp = Date.now();
  const ownerEmail = `guard-owner-${stamp}@test.local`;
  const staffEmail = `guard-staff-${stamp}@test.local`;
  let ownerId: string;
  let staffUserId: string;
  let groupId: string;
  let otherGroupId: string;
  let estId: string;
  let otherEstId: string;
  let staffId: string;

  beforeAll(async () => {
    const { data: g } = await service.from('groups').insert({ name: 'Guard A', settings: {} }).select('id').single();
    groupId = g!.id;
    const { data: g2 } = await service.from('groups').insert({ name: 'Guard B', settings: {} }).select('id').single();
    otherGroupId = g2!.id;

    const { data: e } = await service.from('establishments')
      .insert({ group_id: groupId, name: 'Guard A', slug: `guard-a-${stamp}`, business_type: 'restaurant' })
      .select('id').single();
    estId = e!.id;
    const { data: e2 } = await service.from('establishments')
      .insert({ group_id: otherGroupId, name: 'Guard B', slug: `guard-b-${stamp}`, business_type: 'restaurant' })
      .select('id').single();
    otherEstId = e2!.id;

    const { data: o } = await service.auth.admin.createUser({ email: ownerEmail, password: PASSWORD, email_confirm: true });
    ownerId = o.user!.id;
    await service.from('user_roles').insert({ user_id: ownerId, role: 'group_admin', group_id: groupId });

    const { data: s } = await service.auth.admin.createUser({ email: staffEmail, password: PASSWORD, email_confirm: true });
    staffUserId = s.user!.id;
    const { data: sp } = await service.from('staff_profiles')
      .insert({ establishment_id: estId, user_id: staffUserId, full_name: 'Guard Staff' })
      .select('id').single();
    staffId = sp!.id;
    await service.from('user_roles').insert({ user_id: staffUserId, role: 'staff', establishment_id: estId });
  });

  afterAll(async () => {
    await service.from('user_roles').delete().in('user_id', [ownerId, staffUserId]);
    await service.from('staff_profiles').delete().eq('id', staffId);
    await service.from('establishments').delete().eq('group_id', groupId);
    await service.from('establishments').delete().eq('id', otherEstId);
    await service.from('groups').delete().in('id', [groupId, otherGroupId]);
    if (ownerId) await service.auth.admin.deleteUser(ownerId);
    if (staffUserId) await service.auth.admin.deleteUser(staffUserId);
  });

  async function signIn(email: string) {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw new Error(`signIn failed: ${error.message}`);
    return client;
  }

  it('a group admin cannot zero the platform fee or grant himself Pro', async () => {
    const owner = await signIn(ownerEmail);
    const { error } = await owner.from('groups')
      .update({ platform_fee_bps: 0, platform_fixed_fee_cents: 0, plan: 'pro' })
      .eq('id', groupId);
    expect(error).not.toBeNull();

    const { data } = await service.from('groups').select('platform_fee_bps, plan').eq('id', groupId).single();
    expect(data!.platform_fee_bps).toBeGreaterThan(0);
    expect(data!.plan).toBe('free');
  });

  it('a group admin cannot point his group at another Stripe customer', async () => {
    const owner = await signIn(ownerEmail);
    const { error } = await owner.from('groups')
      .update({ stripe_customer_id: 'cus_someone_else', stripe_subscription_id: 'sub_x' })
      .eq('id', groupId);
    expect(error).not.toBeNull();
  });

  it('a group admin can still edit his own group details', async () => {
    const owner = await signIn(ownerEmail);
    const { error } = await owner.from('groups')
      .update({ name: 'Guard A renamed', accountant_email: 'compta@test.local' })
      .eq('id', groupId);
    expect(error).toBeNull();
  });

  it('a group admin cannot mark his establishment as Stripe-verified', async () => {
    const owner = await signIn(ownerEmail);
    const { error } = await owner.from('establishments')
      .update({ stripe_charges_enabled: true, stripe_payouts_enabled: true })
      .eq('id', estId);
    expect(error).not.toBeNull();
  });

  it('an establishment inserted by a group admin starts without Stripe state', async () => {
    const owner = await signIn(ownerEmail);
    const { data, error } = await owner.from('establishments')
      .insert({
        group_id: groupId, name: 'Guard A2', slug: `guard-a2-${stamp}`, business_type: 'restaurant',
        stripe_charges_enabled: true, is_demo: true,
      })
      .select('stripe_charges_enabled, is_demo')
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ stripe_charges_enabled: false, is_demo: false });
  });

  it('a staff member cannot move himself into another establishment', async () => {
    const staff = await signIn(staffEmail);
    const { error } = await staff.from('staff_profiles')
      .update({ establishment_id: otherEstId })
      .eq('id', staffId);
    expect(error).not.toBeNull();

    const { data } = await service.from('staff_profiles').select('establishment_id').eq('id', staffId).single();
    expect(data!.establishment_id).toBe(estId);
  });

  it('a staff member cannot reactivate or delete himself, but can rename himself', async () => {
    const staff = await signIn(staffEmail);
    const { error: activeErr } = await staff.from('staff_profiles').update({ is_active: false }).eq('id', staffId);
    expect(activeErr).not.toBeNull();

    const { error: nameErr } = await staff.from('staff_profiles').update({ full_name: 'Guard Staff Renamed' }).eq('id', staffId);
    expect(nameErr).toBeNull();
  });

  it('the group admin can still deactivate his staff member', async () => {
    const owner = await signIn(ownerEmail);
    const { error } = await owner.from('staff_profiles').update({ is_active: false }).eq('id', staffId);
    expect(error).toBeNull();
    await service.from('staff_profiles').update({ is_active: true }).eq('id', staffId);
  });

  it('the service role keeps full write access (webhooks, admin actions)', async () => {
    const { error } = await service.from('groups').update({ plan: 'pro', platform_fee_bps: 300 }).eq('id', groupId);
    expect(error).toBeNull();
  });
});
