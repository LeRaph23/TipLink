'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { inviteStaffMember } from './staff';

const ColleagueSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
});

const PostPurchaseSchema = z.object({
  establishmentName: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  adminFullName: z.string().min(1).max(200),
  colleagues: z.array(ColleagueSchema).max(20).default([]),
  locale: z.enum(['fr', 'en']).default('fr'),
});

const NfcOnboardingSchema = z.object({
  nfcCodes: z.array(z.string().min(1).max(32)).min(1).max(20),
  establishmentName: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  adminFullName: z.string().min(1).max(200),
  colleagues: z.array(ColleagueSchema).max(20).default([]),
  locale: z.enum(['fr', 'en']).default('fr'),
});

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

// Validates a single NFC short_id and returns its DB id if it's unassigned.
export async function validateSmartTagCode(
  code: string
): Promise<{ valid: boolean; id?: string }> {
  const service = createServiceClient();
  const { data } = await service
    .from('nfc_stickers')
    .select('id')
    .eq('short_id', code.trim().toUpperCase())
    .is('establishment_id', null)
    .maybeSingle();

  return data ? { valid: true, id: data.id } : { valid: false };
}

// For authenticated group_admin who just completed the post-purchase wizard.
// Updates the existing establishment + group, invites colleagues.
export async function completePostPurchaseOnboarding(
  input: z.infer<typeof PostPurchaseSchema>
): Promise<{ success: true } | { error: string }> {
  const parsed = PostPurchaseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const service = createServiceClient();

  // Resolve the user's group
  const { data: roleRow } = await service
    .from('user_roles')
    .select('group_id')
    .eq('user_id', user.id)
    .eq('role', 'group_admin')
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!roleRow?.group_id) return { error: 'Aucun groupe trouvé pour cet utilisateur.' };

  // Get the first establishment for this group
  const { data: est } = await service
    .from('establishments')
    .select('id')
    .eq('group_id', roleRow.group_id)
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (!est) return { error: 'Aucun établissement trouvé.' };

  const { establishmentName, address, adminFullName, colleagues, locale } = parsed.data;
  const slug = makeSlug(establishmentName);

  // Update establishment
  const { error: estErr } = await service
    .from('establishments')
    .update({ name: establishmentName, address, slug })
    .eq('id', est.id);

  if (estErr) return { error: estErr.message };

  // Update group name to match
  const { error: groupNameErr } = await service
    .from('groups')
    .update({ name: establishmentName })
    .eq('id', roleRow.group_id);

  if (groupNameErr) return { error: groupNameErr.message };

  // Update auth user display name
  await supabase.auth.updateUser({ data: { full_name: adminFullName } });

  // Invite colleagues (best-effort, don't block on failure)
  if (colleagues.length > 0) {
    await Promise.allSettled(
      colleagues.map((c) =>
        inviteStaffMember({
          fullName: c.fullName,
          email: c.email,
          establishmentId: est.id,
          role: 'staff',
          locale,
        })
      )
    );
  }

  // Mark onboarding complete
  const { error: doneErr } = await service
    .from('groups')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', roleRow.group_id);

  if (doneErr) return { error: doneErr.message };

  revalidatePath('/dashboard');
  return { success: true };
}

// For the unauthenticated NFC scan flow.
// The client-side wizard calls supabase.auth.signUp() BEFORE this action,
// so the session cookie is set and createClient() can read the new user.
export async function completeNfcOnboarding(
  input: z.infer<typeof NfcOnboardingSchema>
): Promise<{ success: true } | { error: string }> {
  const parsed = NfcOnboardingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non authentifié — créez votre compte en premier.' };

  const service = createServiceClient();
  const { nfcCodes, establishmentName, address, adminFullName, colleagues, locale } = parsed.data;

  // Verify all NFC codes are valid unassigned stickers
  const normalizedCodes = nfcCodes.map((c) => c.trim().toUpperCase());
  const { data: stickers } = await service
    .from('nfc_stickers')
    .select('id, short_id')
    .in('short_id', normalizedCodes)
    .is('establishment_id', null);

  const foundCodes = new Set((stickers ?? []).map((s) => s.short_id));
  const invalid = normalizedCodes.filter((c) => !foundCodes.has(c));
  if (invalid.length > 0) {
    return { error: `Codes invalides ou déjà assignés : ${invalid.join(', ')}` };
  }

  const slug = makeSlug(establishmentName);

  // Create group
  const { data: group, error: groupErr } = await service
    .from('groups')
    .insert({
      name: establishmentName,
      settings: { tip_thresholds: [1, 2, 5, 10] },
      onboarding_completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (groupErr || !group) return { error: groupErr?.message ?? 'Erreur lors de la création du groupe.' };

  // Create establishment
  const { data: est, error: estErr } = await service
    .from('establishments')
    .insert({
      group_id: group.id,
      name: establishmentName,
      address,
      business_type: 'beauty',
      slug,
      country: 'FR',
      currency: 'eur',
      onboarding_status: 'not_started',
    })
    .select('id')
    .single();

  if (estErr || !est) {
    // Rollback: soft-delete the group we just created
    await service.from('groups').update({ deleted_at: new Date().toISOString() }).eq('id', group.id);
    return { error: estErr?.message ?? 'Erreur lors de la création de l\'établissement.' };
  }

  // Assign all NFC stickers to this establishment
  if ((stickers ?? []).length > 0) {
    await service
      .from('nfc_stickers')
      .update({ establishment_id: est.id })
      .in('id', (stickers ?? []).map((s) => s.id));
  }

  // Create group_admin role for the new user
  await service.from('user_roles').insert({
    user_id: user.id,
    role: 'group_admin',
    group_id: group.id,
  });

  // Update user display name
  await supabase.auth.updateUser({ data: { full_name: adminFullName } });

  // Invite colleagues (best-effort)
  if (colleagues.length > 0) {
    await Promise.allSettled(
      colleagues.map((c) =>
        inviteStaffMember({
          fullName: c.fullName,
          email: c.email,
          establishmentId: est.id,
          role: 'staff',
          locale,
        })
      )
    );
  }

  revalidatePath('/dashboard');
  return { success: true };
}
