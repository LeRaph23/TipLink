'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendStaffInviteLink } from '@/lib/staff-invite';
import { signOnboardingToken, verifyOnboardingToken } from '@/lib/auth/onboarding-token';
import { makeUniqueEstablishmentSlug } from '@/lib/establishment-slug';
import { normalizeGoogleReviewUrl } from '@/lib/google-places';
import { actionError, classifyDbError } from '@/lib/errors/action-error';
import { authorizeEstablishmentAccess } from '@/lib/auth/establishment-access';

/**
 * What the three provisioning actions return.
 *
 * Provisioning no longer finishes onboarding: it creates the group,
 * establishment, roles and staff, then hands back the establishment so the
 * wizard can run its Connect step. `finalizeOnboarding` is what actually marks
 * the group complete — and it refuses to until Stripe says the account's
 * onboarding form was submitted.
 *
 * `onboardingToken` is present only in the flows that have no session at that
 * point (scan and express both sign the user out pending email confirmation);
 * it lets the embedded Connect components authenticate.
 */
export type ProvisionResult =
  | { success: true; establishmentId: string; onboardingToken?: string }
  // `code` lets the wizard react to a failure it can route around, rather than
  // only display it. The localized `error` stays the thing shown either way.
  | { error: string; code?: 'smart_tag_taken' };

// Shared review-link fields collected by the onboarding wizard's Google step.
const GoogleReviewFields = {
  googlePlaceId: z.string().max(300).optional(),
  googleReviewUrl: z.string().max(1000).optional(),
};

// Turns the raw wizard input into a clean establishments column patch. The
// review URL is normalised (place_id / g.page / maps link → canonical link);
// anything unrecognised is dropped rather than stored as junk.
function googleReviewPatch(input: { googlePlaceId?: string; googleReviewUrl?: string }) {
  const url = input.googleReviewUrl ? normalizeGoogleReviewUrl(input.googleReviewUrl) : null;
  if (!url) return {};
  return {
    google_review_url: url,
    ...(input.googlePlaceId ? { google_place_id: input.googlePlaceId } : {}),
  };
}

/**
 * Mints the Connect-step token, but never at the cost of the provisioning that
 * just succeeded.
 *
 * By the time this is called the group, establishment, roles and staff already
 * exist. Letting a signing failure (a misconfigured secret, say) propagate would
 * turn a completed provisioning into a generic error on the wizard's last step,
 * with no way forward: retrying re-runs sign-up against an email that now
 * exists, and every other path duplicates the group. The token is optional in
 * `ProvisionResult` for exactly this reason — the Connect step falls back to the
 * user's session when it is absent.
 */
function mintOnboardingToken(groupId: string, email: string | undefined): string | undefined {
  if (!email) return undefined;
  try {
    return signOnboardingToken(groupId, email);
  } catch (err) {
    console.error('[action-error] onboarding.token — provisioning kept, Connect step falls back to the session', err);
    return undefined;
  }
}

const PostPurchaseSchema = z.object({
  establishmentName: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  adminFullName: z.string().min(1).max(200),
  businessType: z.enum(['restaurant', 'beauty']).default('beauty'),
  locale: z.enum(['fr', 'en']).default('fr'),
  ...GoogleReviewFields,
});

const NfcOnboardingSchema = z.object({
  userId: z.string().uuid(),
  nfcCodes: z.array(z.string().min(1).max(32)).min(1).max(20),
  establishmentName: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  adminFullName: z.string().min(1).max(200),
  businessType: z.enum(['restaurant', 'beauty']).default('beauty'),
  locale: z.enum(['fr', 'en']).default('fr'),
  ...GoogleReviewFields,
});

// `validateSmartTagCode` lived here and had no caller — the wizard has always
// gone through GET /api/onboarding/validate-code. It carried the same
// case-sensitivity bug that route just lost, so it is removed rather than
// fixed twice: one definition of "is this tag claimable", in the route, and
// one definition of "claim it", in the claim_nfc_stickers RPC.

// For authenticated group_admin who just completed the post-purchase wizard.
// Updates the existing establishment + group.
export async function completePostPurchaseOnboarding(
  input: z.infer<typeof PostPurchaseSchema>
): Promise<ProvisionResult> {
  const parsed = PostPurchaseSchema.safeParse(input);
  if (!parsed.success) return actionError('validation', parsed.error, 'completePostPurchaseOnboarding');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionError('forbidden');

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

  if (!roleRow?.group_id) return actionError('notFound');

  // Get the first establishment for this group
  const { data: est } = await service
    .from('establishments')
    .select('id')
    .eq('group_id', roleRow.group_id)
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (!est) return actionError('notFound');

  const { establishmentName, address, adminFullName, locale } = parsed.data;
  const slug = await makeUniqueEstablishmentSlug(service, establishmentName, est.id);

  // Update establishment
  const { error: estErr } = await service
    .from('establishments')
    .update({ name: establishmentName, address, slug, business_type: parsed.data.businessType, ...googleReviewPatch(parsed.data) })
    .eq('id', est.id);

  if (estErr) return actionError(classifyDbError(estErr), estErr, 'completePostPurchaseOnboarding.est');

  // Update group name to match
  const { error: groupNameErr } = await service
    .from('groups')
    .update({ name: establishmentName })
    .eq('id', roleRow.group_id);

  if (groupNameErr) return actionError(classifyDbError(groupNameErr), groupNameErr, 'completePostPurchaseOnboarding.group');

  // Update auth user display name
  await supabase.auth.updateUser({ data: { full_name: adminFullName } });

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

  revalidatePath('/dashboard');
  // Completion is deferred to finalizeOnboarding(), after the Connect step.
  // This caller is authenticated, so no onboarding token is minted.
  return { success: true, establishmentId: est.id };
}

const ExpressOnboardingSchema = z.object({
  groupId: z.string().uuid(),
  // HMAC token signed by the server when the order confirmation email was sent.
  // Without it the wizard cannot be completed for an arbitrary group UUID.
  token: z.string().min(10),
  establishmentName: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  adminFullName: z.string().min(1).max(200),
  businessType: z.enum(['restaurant', 'beauty']).default('beauty'),
  locale: z.enum(['fr', 'en']).default('fr'),
  // Optional: when Supabase email confirmation is enabled, sign-up returns
  // no session, so we fall back to the admin API to resolve the user.
  userId: z.string().uuid().optional(),
  ...GoogleReviewFields,
});

// For the express checkout flow (bought on landing page, no existing account).
// The client calls supabase.auth.signUp() first, then this action links the
// new user to the pre-existing group created by the Stripe webhook.
export async function completeExpressOnboarding(
  input: z.infer<typeof ExpressOnboardingSchema>
): Promise<ProvisionResult> {
  const parsed = ExpressOnboardingSchema.safeParse(input);
  if (!parsed.success) return actionError('validation', parsed.error, 'completeExpressOnboarding');

  const service = createServiceClient();
  const { groupId, token, establishmentName, address, adminFullName, locale, userId } = parsed.data;

  const verified = verifyOnboardingToken(token, groupId);
  if (!verified.valid) {
    return actionError('forbidden');
  }

  const supabase = await createClient();
  const { data: { user: sessionUser } } = await supabase.auth.getUser();

  let user = sessionUser;
  if (!user && userId) {
    const { data: adminLookup } = await service.auth.admin.getUserById(userId);
    user = adminLookup.user ?? null;
  }
  if (!user) return actionError('forbidden');

  // Bind the group_admin grant to the email the onboarding token was issued for
  // (the address the paid order confirmation was sent to). The signed token only
  // proves "someone holds a valid link"; without this check a leaked/forwarded
  // link would let any authenticated account — or any client-supplied userId —
  // claim the group. The express wizard pre-fills this email, so the legitimate
  // flow always matches.
  const tokenEmail = verified.email?.trim().toLowerCase() || null;
  const userEmail = user.email?.trim().toLowerCase() || null;
  if (tokenEmail && tokenEmail !== userEmail) {
    return actionError('forbidden');
  }

  // Verify the group exists and hasn't been onboarded yet
  const { data: group } = await service
    .from('groups')
    .select('id, onboarding_completed_at')
    .eq('id', groupId)
    .maybeSingle();

  if (!group) return actionError('notFound');
  if (group.onboarding_completed_at) return actionError('duplicate');

  // Get the establishment created by the webhook
  const { data: est } = await service
    .from('establishments')
    .select('id')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!est) return actionError('notFound');

  const slug = await makeUniqueEstablishmentSlug(service, establishmentName, est.id);

  // Update establishment with wizard data
  const { error: estErr } = await service
    .from('establishments')
    .update({ name: establishmentName, address, slug, business_type: parsed.data.businessType, ...googleReviewPatch(parsed.data) })
    .eq('id', est.id);

  if (estErr) return actionError(classifyDbError(estErr), estErr, 'completeExpressOnboarding.est');

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

  revalidatePath('/dashboard');
  // Completion is deferred to finalizeOnboarding(), after the Connect step.
  // The caller already holds a valid token for this group — hand it back so the
  // embedded onboarding can authenticate without a session.
  return { success: true, establishmentId: est.id, onboardingToken: token };
}

// For the unauthenticated NFC scan flow.
// The client-side wizard calls supabase.auth.signUp() BEFORE this action,
// so the session cookie is set and createClient() can read the new user.
export async function completeNfcOnboarding(
  input: z.infer<typeof NfcOnboardingSchema>
): Promise<ProvisionResult> {
  const parsed = NfcOnboardingSchema.safeParse(input);
  if (!parsed.success) return actionError('validation', parsed.error, 'completeNfcOnboarding');

  const service = createServiceClient();
  const { userId, nfcCodes, establishmentName, address, adminFullName, locale } = parsed.data;

  // Verify the user exists in Supabase auth (works even before email confirmation)
  const { data: { user }, error: userErr } = await service.auth.admin.getUserById(userId);
  if (userErr || !user) return actionError('notFound', userErr, 'completeNfcOnboarding.user');

  const normalizedCodes = nfcCodes.map((c) => c.trim().toLowerCase());
  const slug = await makeUniqueEstablishmentSlug(service, establishmentName);

  // Create group
  const { data: group, error: groupErr } = await service
    .from('groups')
    .insert({
      name: establishmentName,
      settings: { tip_thresholds: [5, 10, 20] },
      // Deliberately NOT marked complete here: the wizard still has to take the
      // manager through the Connect step. finalizeOnboarding() sets it once
      // Stripe confirms the onboarding form was submitted.
    })
    .select('id')
    .single();

  if (groupErr || !group) return actionError(classifyDbError(groupErr), groupErr, 'completeNfcOnboarding.group');

  // Create establishment
  const { data: est, error: estErr } = await service
    .from('establishments')
    .insert({
      group_id: group.id,
      name: establishmentName,
      address,
      business_type: parsed.data.businessType,
      slug,
      country: 'FR',
      currency: 'eur',
      onboarding_status: 'not_started',
      ...googleReviewPatch(parsed.data),
    })
    .select('id')
    .single();

  if (estErr || !est) {
    // Rollback: soft-delete the group we just created
    await service.from('groups').update({ deleted_at: new Date().toISOString() }).eq('id', group.id);
    return actionError(classifyDbError(estErr), estErr, 'completeNfcOnboarding.est');
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
    return actionError(classifyDbError(claimErr), claimErr, 'completeNfcOnboarding.claim');
  }

  const claimedCodes = new Set((claimed ?? []).map((r) => r.short_id.toLowerCase()));
  const missing = normalizedCodes.filter((c) => !claimedCodes.has(c));
  if (missing.length > 0) {
    // Roll back everything — the user must restart with valid codes.
    await service.from('establishments').update({ deleted_at: new Date().toISOString() }).eq('id', est.id);
    await service.from('groups').update({ deleted_at: new Date().toISOString() }).eq('id', group.id);
    // Not 'validation': the codes step already checked these against
    // resolve_sticker_establishment, so reaching here means a tag was claimed
    // in the meantime or belongs to someone else. "Check your entry" would send
    // the manager hunting for a typo on a step that has no field to correct.
    return {
      ...(await actionError('smartTagTaken', `unclaimable codes: ${missing.join(', ')}`, 'completeNfcOnboarding.codes')),
      code: 'smart_tag_taken' as const,
    };
  }

  // Create group_admin role for the new user
  await service.from('user_roles').insert({
    user_id: user.id,
    role: 'group_admin',
    group_id: group.id,
  });

  // Update user display name via admin API (works without active session)
  await service.auth.admin.updateUserById(user.id, { user_metadata: { full_name: adminFullName } });

  revalidatePath('/dashboard');
  // The scan flow signs the user out pending email confirmation, so the Connect
  // step has no session to authenticate with. Mint the same signed token the
  // express flow uses — scoped to this group, and to the email that just
  // created it.
  return {
    success: true,
    establishmentId: est.id,
    onboardingToken: mintOnboardingToken(group.id, user.email),
  };
}

const FinalizeSchema = z.object({
  establishmentId: z.string().uuid(),
  // Present in the scan / express flows, where the user has no session yet.
  token: z.string().min(10).optional(),
});

export type FinalizeResult =
  | { success: true; chargesEnabled: boolean; payoutsEnabled: boolean }
  | { error: string };

/**
 * Closes the onboarding wizard.
 *
 * It used to refuse until Stripe confirmed the establishment had submitted its
 * KYC form, because the wizard's last step was that form. Making it blocking
 * put the longest, least welcome part of the setup between the manager and any
 * sign that this thing works, and it is where they stopped.
 *
 * Verification now happens from the dashboard, where the banner asks for it and
 * the payments page hosts the form. Nothing about the money changed: the tip
 * pages still gate on `charges_enabled AND payouts_enabled` (get_public_staff,
 * migration 00074), so an establishment that closes the wizard without a Stripe
 * account cannot be paid and cannot leave funds sitting anywhere. All that is
 * different is that they now have a dashboard telling them so.
 *
 * The flags come back from our own row rather than a Stripe round-trip: there
 * is usually no account yet at this point, and the done screen only uses them
 * to decide which sentence to show.
 */
export async function finalizeOnboarding(
  input: z.infer<typeof FinalizeSchema>
): Promise<FinalizeResult> {
  const parsed = FinalizeSchema.safeParse(input);
  if (!parsed.success) return actionError('validation', parsed.error, 'finalizeOnboarding');

  const service = createServiceClient();
  const { establishmentId, token } = parsed.data;

  const access = await authorizeEstablishmentAccess(service, establishmentId, token);
  if (!access.ok) return actionError(access.status === 404 ? 'notFound' : 'forbidden');

  const { data: est } = await service
    .from('establishments')
    .select('stripe_charges_enabled, stripe_payouts_enabled')
    .eq('id', establishmentId)
    .maybeSingle();

  const { error: doneErr } = await service
    .from('groups')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', access.groupId)
    .is('onboarding_completed_at', null);

  if (doneErr) return actionError(classifyDbError(doneErr), doneErr, 'finalizeOnboarding.done');

  revalidatePath('/dashboard');
  return {
    success: true,
    chargesEnabled: est?.stripe_charges_enabled ?? false,
    payoutsEnabled: est?.stripe_payouts_enabled ?? false,
  };
}
