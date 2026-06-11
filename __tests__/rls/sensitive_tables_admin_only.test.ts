/**
 * RLS — ambassador / commercial tables are super-admin-only.
 *
 * These tables hold commission, payout and partner-identity (PII) data. Their
 * RLS policies restrict reads to super_admins (service role bypasses RLS for
 * the server-side flows). This guards against a policy regression that would
 * let an ordinary authenticated user (here: a group_admin) read them.
 *
 * The ambassador_sales / commercial_sales / group_tip_transfers tables share
 * the same super-admin-only SELECT policy; the four checked here are
 * representative (top-level identity + payout amounts) and need the least
 * fixture scaffolding.
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

describe.skipIf(skipIfNoLocal)('ambassador/commercial tables RLS (super-admin only)', () => {
  const service = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let ambPromoId: string;
  let comPromoId: string;
  let ambassadorId: string;
  let commercialId: string;
  let ambPayoutId: string;
  let comPayoutId: string;
  let groupId: string;
  let adminEmail: string;
  let adminUserId: string;

  async function mkPromo(suffix: string): Promise<string> {
    const { data, error } = await service
      .from('promo_codes')
      .insert({
        code: `RLS-${suffix}-${tag}`,
        stripe_coupon_id: `coupon_${suffix}_${tag}`,
        stripe_promo_code_id: `promo_${suffix}_${tag}`,
        percentage_off: 10,
      })
      .select('id')
      .single();
    if (error) throw new Error(`promo insert failed: ${error.message}`);
    return data!.id as string;
  }

  beforeAll(async () => {
    ambPromoId = await mkPromo('amb');
    comPromoId = await mkPromo('com');

    const { data: amb } = await service
      .from('ambassadors')
      .insert({ name: 'RLS Ambassador', promo_code_id: ambPromoId, pin_hash: 'deadbeef' })
      .select('id')
      .single();
    ambassadorId = amb!.id;

    const { data: com } = await service
      .from('commerciaux')
      .insert({
        name: 'RLS Commercial',
        company_name: 'RLS Co',
        legal_form: 'auto_entrepreneur',
        vrp_status: 'independant',
        siret: '12345678901234',
        email: `rls-com-${tag}@test.local`,
        phone: '0600000000',
        city: 'Paris',
        promo_code_id: comPromoId,
      })
      .select('id')
      .single();
    commercialId = com!.id;

    const { data: ambPayout } = await service
      .from('ambassador_payouts')
      .insert({ ambassador_id: ambassadorId, amount_cents: 3000, status: 'paid' })
      .select('id')
      .single();
    ambPayoutId = ambPayout!.id;

    const { data: comPayout } = await service
      .from('commercial_payouts')
      .insert({ commercial_id: commercialId, amount_cents: 5000, status: 'paid' })
      .select('id')
      .single();
    comPayoutId = comPayout!.id;

    const { data: grp } = await service
      .from('groups')
      .insert({ name: `RLS Sensitive Group ${tag}`, settings: {} })
      .select('id')
      .single();
    groupId = grp!.id;

    adminEmail = `rls-sensitive-admin-${tag}@test.local`;
    const { data: { user } } = await service.auth.admin.createUser({
      email: adminEmail,
      password: 'test-password-rls-123',
      email_confirm: true,
    });
    adminUserId = user!.id;
    await service.from('user_roles').insert({
      user_id: adminUserId,
      role: 'group_admin',
      group_id: groupId,
    });
  });

  afterAll(async () => {
    await service.from('ambassador_payouts').delete().eq('id', ambPayoutId);
    await service.from('commercial_payouts').delete().eq('id', comPayoutId);
    await service.from('ambassadors').delete().eq('id', ambassadorId);
    await service.from('commerciaux').delete().eq('id', commercialId);
    await service.from('promo_codes').delete().in('id', [ambPromoId, comPromoId]);
    await service.from('groups').delete().eq('id', groupId);
    if (adminUserId) await service.auth.admin.deleteUser(adminUserId);
  });

  async function clientAsGroupAdmin() {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await client.auth.signInWithPassword({
      email: adminEmail,
      password: 'test-password-rls-123',
    });
    if (error) throw new Error(`signIn failed: ${error.message}`);
    return client;
  }

  it('service role (super-admin bypass) sees the seeded rows', async () => {
    const { data } = await service.from('ambassadors').select('id').eq('id', ambassadorId);
    expect(data ?? []).toHaveLength(1);
  });

  it('group_admin cannot read ambassadors', async () => {
    const client = await clientAsGroupAdmin();
    const { data } = await client.from('ambassadors').select('id').eq('id', ambassadorId);
    expect(data ?? []).toHaveLength(0);
  });

  it('group_admin cannot read commerciaux', async () => {
    const client = await clientAsGroupAdmin();
    const { data } = await client.from('commerciaux').select('id').eq('id', commercialId);
    expect(data ?? []).toHaveLength(0);
  });

  it('group_admin cannot read ambassador_payouts', async () => {
    const client = await clientAsGroupAdmin();
    const { data } = await client.from('ambassador_payouts').select('id').eq('id', ambPayoutId);
    expect(data ?? []).toHaveLength(0);
  });

  it('group_admin cannot read commercial_payouts', async () => {
    const client = await clientAsGroupAdmin();
    const { data } = await client.from('commercial_payouts').select('id').eq('id', comPayoutId);
    expect(data ?? []).toHaveLength(0);
  });
});
