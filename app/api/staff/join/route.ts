import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createStandardAccount, createOnboardingLink, staffBankingReturnUrls } from '@/lib/stripe/connect';

export const runtime = 'nodejs';

// Joins a staff member to an establishment, then creates their Stripe Standard
// connected account and returns a hosted-onboarding URL. Banking details
// (identity, IBAN, terms) are collected by Stripe — not by this endpoint.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    establishmentId?: string;
    fullName?: string;
    selectedProfileId?: string | null;
    avatarUrl?: string | null;
    locale?: string;
  };
  const { establishmentId, fullName, selectedProfileId, avatarUrl } = body;
  const locale = body.locale === 'en' ? 'en' : 'fr';

  if (!establishmentId) return NextResponse.json({ error: 'Missing establishmentId' }, { status: 400 });

  const service = createServiceClient();

  const { data: est } = await service
    .from('establishments')
    .select('id, group_id')
    .eq('id', establishmentId)
    .is('deleted_at', null)
    .single();

  if (!est) return NextResponse.json({ error: 'Establishment not found' }, { status: 404 });

  let staffProfileId: string;

  if (selectedProfileId) {
    // Claiming an existing pending profile. The UPDATE is guarded by
    // `is_active = false` so two users racing for the same invite link
    // cannot both win — the second UPDATE matches 0 rows.
    const { data: claimed, error: patchErr } = await service
      .from('staff_profiles')
      .update({
        user_id: user.id,
        avatar_url: avatarUrl ?? null,
        is_active: true,
        onboarding_status: 'not_started',
        ...(fullName?.trim() ? { full_name: fullName.trim() } : {}),
      })
      .eq('id', selectedProfileId)
      .eq('establishment_id', establishmentId)
      .eq('is_active', false)
      .is('deleted_at', null)
      .select('id');

    if (patchErr) {
      // 23505 = unique (user_id, establishment_id) — this user already has a
      // profile in this establishment.
      if ((patchErr as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Vous faites déjà partie de cet établissement.' }, { status: 409 });
      }
      return NextResponse.json({ error: patchErr.message }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'Profil introuvable ou déjà réclamé.' }, { status: 409 });
    }
    staffProfileId = selectedProfileId;
  } else {
    // Creating a new profile
    if (!fullName?.trim()) return NextResponse.json({ error: 'Missing fullName' }, { status: 400 });

    const { data: existing } = await service
      .from('staff_profiles')
      .select('id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) return NextResponse.json({ error: 'Profile already exists' }, { status: 409 });

    const { data: newProfile, error: insertErr } = await service
      .from('staff_profiles')
      .insert({
        user_id: user.id,
        establishment_id: establishmentId,
        full_name: fullName.trim(),
        avatar_url: avatarUrl ?? null,
        onboarding_status: 'not_started',
        is_active: true,
      })
      .select('id')
      .single();

    if (insertErr || !newProfile) {
      // 23505 = unique (user_id, establishment_id) — concurrent double-submit.
      if (insertErr && (insertErr as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'Profil déjà créé.' }, { status: 409 });
      }
      return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 });
    }
    staffProfileId = newProfile.id;
  }

  // Ensure staff role exists
  const { data: existingRole } = await service
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('establishment_id', establishmentId)
    .maybeSingle();

  if (!existingRole) {
    await service.from('user_roles').insert({
      user_id: user.id,
      role: 'staff',
      establishment_id: establishmentId,
    });
  }

  // Create the Stripe Standard connected account + hosted-onboarding link.
  try {
    const accountId = await createStandardAccount({
      email: user.email ?? undefined,
      businessType: 'individual',
      fullName: fullName?.trim() || undefined,
      metadata: { staff_profile_id: staffProfileId },
    });
    await service
      .from('staff_profiles')
      .update({ stripe_account_id: accountId, onboarding_status: 'pending' })
      .eq('id', staffProfileId);
    const url = await createOnboardingLink(accountId, staffBankingReturnUrls(locale));
    return NextResponse.json({ ok: true, onboardingUrl: url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Création du compte Stripe échouée';
    console.error('staff/join: Stripe account creation failed', err);
    // Rollback: deactivate the profile we just created/claimed.
    await service
      .from('staff_profiles')
      .update({ is_active: false, user_id: null, onboarding_status: 'not_started' })
      .eq('id', staffProfileId);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
