'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendStaffInviteLink } from '@/lib/staff-invite';
import { verifyOnboardingToken } from '@/lib/auth/onboarding-token';

const ColleagueSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
});

async function addColleague(
  service: ReturnType<typeof createServiceClient>,
  { fullName, email, establishmentId, establishmentName, locale }: {
    fullName: string; email?: string; establishmentId: string;
    establishmentName: string; locale: 'fr' | 'en';
  }
) {
  // Onboarding runs before the admin has a session, so the profile is
  // created with the service role rather than an RLS-checked insert.
  const { data: staff } = await service
    .from('staff_profiles')
    .insert({
      full_name: fullName,
      establishment_id: establishmentId,
      is_active: false,
    })
    .select('id')
    .single();

  const trimmedEmail = email?.trim();
  if (staff && trimmedEmail) {
    await sendStaffInviteLink(service, {
      staffProfileId: staff.id,
      fullName,
      email: trimmedEmail,
      establishmentId,
      establishmentName,
      role: 'staff',
      locale,
    });
  }
}

const PostPurchaseSchema = z.object({
  establishmentName: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  adminFullName: z.string().min(1).max(200),
  colleagues: z.array(ColleagueSchema).max(20).default([]),
  locale: z.enum(['fr', 'en']).default('fr'),
});

const NfcOnboardingSchema = z.object({
  userId: z.string().uuid(),
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
  const normalized = code.trim().toLowerCase();
  if (normalized.length < 4 || !/^[a-z0-9_-]+$/.test(normalized)) {
    return { valid: false };
  }
  const service = createServiceClient();
  // `staff_id` was dropped in migration 00014 — a sticker is "unassigned"
  // (in stock) purely when establishment_id IS NULL.
  const { data } = await service
    .from('nfc_stickers')
    .select('id')
    .eq('short_id', normalized)
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
        addColleague(service, { fullName: c.fullName, email: c.email, establishmentId: est.id, establishmentName, locale })
      )
    );
  }

  // Auto-assign encoded SmartTags from this group's orders to the establishment
  const { data: orderIds } = await service
    .from('smarttag_orders')
    .select('id')
    .eq('group_id', roleRow.group_id);

  if (orderIds?.length) {
    const { data: stickerRows } = await service
      .from('smarttag_order_tags')
      .select('sticker_id')
      .in('order_id', orderIds.map((o) => o.id));

    if (stickerRows?.length) {
      await service
        .from('nfc_stickers')
        .update({ establishment_id: est.id })
        .in('id', stickerRows.map((s) => s.sticker_id))
        .is('establishment_id', null);
    }
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

const ExpressOnboardingSchema = z.object({
  groupId: z.string().uuid(),
  // HMAC token signed by the server when the order confirmation email was sent.
  // Without it the wizard cannot be completed for an arbitrary group UUID.
  token: z.string().min(10),
  establishmentName: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  adminFullName: z.string().min(1).max(200),
  colleagues: z.array(ColleagueSchema).max(20).default([]),
  locale: z.enum(['fr', 'en']).default('fr'),
  // Optional: when Supabase email confirmation is enabled, sign-up returns
  // no session, so we fall back to the admin API to resolve the user.
  userId: z.string().uuid().optional(),
});

// For the express checkout flow (bought on landing page, no existing account).
// The client calls supabase.auth.signUp() first, then this action links the
// new user to the pre-existing group created by the Stripe webhook.
export async function completeExpressOnboarding(
  input: z.infer<typeof ExpressOnboardingSchema>
): Promise<{ success: true } | { error: string }> {
  const parsed = ExpressOnboardingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const service = createServiceClient();
  const { groupId, token, establishmentName, address, adminFullName, colleagues, locale, userId } = parsed.data;

  const verified = verifyOnboardingToken(token, groupId);
  if (!verified.valid) {
    return { error: 'Lien d\'activation invalide ou expiré.' };
  }

  const supabase = await createClient();
  const { data: { user: sessionUser } } = await supabase.auth.getUser();

  let user = sessionUser;
  if (!user && userId) {
    const { data: adminLookup } = await service.auth.admin.getUserById(userId);
    user = adminLookup.user ?? null;
  }
  if (!user) return { error: 'Non authentifié — créez votre compte en premier.' };

  // Verify the group exists and hasn't been onboarded yet
  const { data: group } = await service
    .from('groups')
    .select('id, onboarding_completed_at')
    .eq('id', groupId)
    .maybeSingle();

  if (!group) return { error: 'Groupe introuvable.' };
  if (group.onboarding_completed_at) return { error: 'Ce salon a déjà été configuré.' };

  // Get the establishment created by the webhook
  const { data: est } = await service
    .from('establishments')
    .select('id')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!est) return { error: 'Établissement introuvable.' };

  const slug = makeSlug(establishmentName);

  // Update establishment with wizard data
  const { error: estErr } = await service
    .from('establishments')
    .update({ name: establishmentName, address, slug })
    .eq('id', est.id);

  if (estErr) return { error: estErr.message };

  // Update group name
  await service.from('groups')
    .update({ name: establishmentName })
    .eq('id', groupId);

  // Link user as group_admin
  await service.from('user_roles').upsert(
    { user_id: user.id, role: 'group_admin', group_id: groupId },
    { onConflict: 'user_id,role,group_id' }
  );

  // Update auth user display name. Use the admin API when we don't have a
  // session (e.g. email confirmation still pending) so this always works.
  if (sessionUser) {
    await supabase.auth.updateUser({ data: { full_name: adminFullName } });
  } else {
    await service.auth.admin.updateUserById(user.id, { user_metadata: { full_name: adminFullName } });
  }

  // Invite colleagues (best-effort)
  if (colleagues.length > 0) {
    await Promise.allSettled(
      colleagues.map((c) =>
        addColleague(service, { fullName: c.fullName, email: c.email, establishmentId: est.id, establishmentName, locale })
      )
    );
  }

  // Auto-assign encoded SmartTags from this group's orders to the establishment
  const { data: orderIds } = await service
    .from('smarttag_orders')
    .select('id')
    .eq('group_id', groupId);

  if (orderIds?.length) {
    const { data: stickerRows } = await service
      .from('smarttag_order_tags')
      .select('sticker_id')
      .in('order_id', orderIds.map((o) => o.id));

    if (stickerRows?.length) {
      await service
        .from('nfc_stickers')
        .update({ establishment_id: est.id })
        .in('id', stickerRows.map((s) => s.sticker_id))
        .is('establishment_id', null);
    }
  }

  // Mark onboarding complete
  const { error: doneErr } = await service
    .from('groups')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', groupId);

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

  const service = createServiceClient();
  const { userId, nfcCodes, establishmentName, address, adminFullName, colleagues, locale } = parsed.data;

  // Verify the user exists in Supabase auth (works even before email confirmation)
  const { data: { user }, error: userErr } = await service.auth.admin.getUserById(userId);
  if (userErr || !user) return { error: 'Utilisateur introuvable.' };

  const normalizedCodes = nfcCodes.map((c) => c.trim().toLowerCase());
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

  // Atomically claim the stickers via the SECURITY DEFINER RPC. Two parallel
  // onboardings cannot grab the same sticker thanks to FOR UPDATE SKIP LOCKED.
  // RPC name is not yet in the generated types — cast the rpc() call.
  const claimRpc = (service.rpc.bind(service) as unknown as (
    fn: 'claim_nfc_stickers',
    args: { p_short_ids: string[]; p_establishment_id: string }
  ) => Promise<{ data: Array<{ id: string; short_id: string }> | null; error: { message: string } | null }>);
  const { data: claimed, error: claimErr } = await claimRpc('claim_nfc_stickers', {
    p_short_ids: normalizedCodes,
    p_establishment_id: est.id,
  });

  if (claimErr) {
    await service.from('establishments').update({ deleted_at: new Date().toISOString() }).eq('id', est.id);
    await service.from('groups').update({ deleted_at: new Date().toISOString() }).eq('id', group.id);
    return { error: claimErr.message };
  }

  const claimedCodes = new Set((claimed ?? []).map((r) => r.short_id.toLowerCase()));
  const missing = normalizedCodes.filter((c) => !claimedCodes.has(c));
  if (missing.length > 0) {
    // Roll back everything — the user must restart with valid codes.
    await service.from('establishments').update({ deleted_at: new Date().toISOString() }).eq('id', est.id);
    await service.from('groups').update({ deleted_at: new Date().toISOString() }).eq('id', group.id);
    return { error: `Codes invalides ou déjà assignés : ${missing.join(', ')}` };
  }

  // Create group_admin role for the new user
  await service.from('user_roles').insert({
    user_id: user.id,
    role: 'group_admin',
    group_id: group.id,
  });

  // Update user display name via admin API (works without active session)
  await service.auth.admin.updateUserById(user.id, { user_metadata: { full_name: adminFullName } });

  // Invite colleagues (best-effort)
  if (colleagues.length > 0) {
    await Promise.allSettled(
      colleagues.map((c) =>
        addColleague(service, { fullName: c.fullName, email: c.email, establishmentId: est.id, establishmentName, locale })
      )
    );
  }

  revalidatePath('/dashboard');
  return { success: true };
}
