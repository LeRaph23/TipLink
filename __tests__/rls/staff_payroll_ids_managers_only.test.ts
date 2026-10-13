/**
 * RLS: payroll numbers (00094) are written and read by managers only.
 *
 * staff_profiles lets an employee update their own row (name, photo). The
 * matricule decides whose payslip a sum lands on, so it sits in its own table
 * that the employee can neither read nor write.
 *
 * Prerequisites: npx supabase start
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://localhost:54321';
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_KEY ?? '';
const ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY ?? '';

const skipIfNoLocal = !SERVICE_KEY || !ANON_KEY;

describe.skipIf(skipIfNoLocal)('staff_payroll_ids RLS', () => {
  const service = skipIfNoLocal
    ? (null as unknown as ReturnType<typeof createClient>)
    : createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  const password = 'test-payroll-password';
  let groupId: string;
  let establishmentId: string;
  let staffId: string;
  let adminId: string;
  let staffUserId: string;
  let adminEmail: string;
  let staffEmail: string;

  async function signIn(email: string) {
    const client = createClient(SUPABASE_URL, ANON_KEY);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  beforeAll(async () => {
    const ts = Date.now();
    const { data: group } = await service.from('groups').insert({ name: `Payroll ${ts}`, settings: {} }).select('id').single();
    groupId = group!.id;
    const { data: est } = await service
      .from('establishments')
      .insert({ group_id: groupId, name: 'Payroll Est', business_type: 'restaurant', slug: `payroll-${ts}`, country: 'FR', currency: 'EUR' })
      .select('id')
      .single();
    establishmentId = est!.id;

    adminEmail = `payroll-admin-${ts}@test.local`;
    staffEmail = `payroll-staff-${ts}@test.local`;
    adminId = (await service.auth.admin.createUser({ email: adminEmail, password, email_confirm: true })).data.user!.id;
    staffUserId = (await service.auth.admin.createUser({ email: staffEmail, password, email_confirm: true })).data.user!.id;

    const { data: staff } = await service
      .from('staff_profiles')
      .insert({ establishment_id: establishmentId, full_name: 'Marie', user_id: staffUserId })
      .select('id')
      .single();
    staffId = staff!.id;

    await service.from('user_roles').insert([
      { user_id: adminId, role: 'group_admin', group_id: groupId },
      { user_id: staffUserId, role: 'staff', establishment_id: establishmentId },
    ]);
  });

  afterAll(async () => {
    await service.from('staff_payroll_ids').delete().eq('staff_id', staffId);
    await service.from('staff_profiles').delete().eq('id', staffId);
    await service.from('establishments').delete().eq('id', establishmentId);
    await service.from('groups').delete().eq('id', groupId);
    for (const uid of [adminId, staffUserId]) if (uid) await service.auth.admin.deleteUser(uid);
  });

  it('lets the group admin set and read the matricule', async () => {
    const admin = await signIn(adminEmail);
    const { error } = await admin.from('staff_payroll_ids').upsert({ staff_id: staffId, payroll_id: '00042' });
    expect(error).toBeNull();
    const { data } = await admin.from('staff_payroll_ids').select('payroll_id').eq('staff_id', staffId).maybeSingle();
    expect(data?.payroll_id).toBe('00042');
  });

  it('hides it from the employee and refuses their writes', async () => {
    const staff = await signIn(staffEmail);
    const { data } = await staff.from('staff_payroll_ids').select('payroll_id').eq('staff_id', staffId);
    expect(data ?? []).toEqual([]);

    await staff.from('staff_payroll_ids').upsert({ staff_id: staffId, payroll_id: 'HACK' });
    const { data: still } = await service.from('staff_payroll_ids').select('payroll_id').eq('staff_id', staffId).single();
    expect(still?.payroll_id).toBe('00042');
  });
});
