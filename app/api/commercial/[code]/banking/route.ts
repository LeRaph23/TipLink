import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { createStandardAccount, createOnboardingLink } from '@/lib/stripe/connect';
import { getBaseUrl } from '@/lib/env';
import { authenticateCommercialRequest } from '@/lib/auth/commercial-session';

export const runtime = 'nodejs';

function validateSiret(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  return /^\d{14}$/.test(clean) ? clean : null;
}

function commercialReturnUrls(code: string): { refresh_url: string; return_url: string } {
  const base = getBaseUrl();
  return {
    refresh_url: `${base}/pro/${code}?stripe=refresh`,
    return_url: `${base}/pro/${code}?stripe=return`,
  };
}

// POST — create the commercial's Stripe Standard account and return an
// onboarding URL. SIRET stays a TipLink requirement (commerciaux pros must be
// registered businesses); everything else is collected by Stripe's hosted UX.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const commercialId = authenticateCommercialRequest(req, code);
  if (!commercialId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { siret, email } = body as { siret?: string; email?: string };

  const siretClean = siret ? validateSiret(siret) : null;
  if (!siretClean) {
    return NextResponse.json({
      error: 'SIRET invalide. Le SIRET (14 chiffres) est obligatoire pour les Commerciaux Pros.',
    }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: com } = await service
    .from('commerciaux')
    .select('id, stripe_account_id')
    .eq('id', commercialId)
    .maybeSingle();

  if (!com) return NextResponse.json({ error: 'Commercial introuvable' }, { status: 404 });

  const urls = commercialReturnUrls(code);
  try {
    let accountId = com.stripe_account_id;
    if (!accountId) {
      accountId = await createStandardAccount({
        email: email || undefined,
        metadata: { commercial_id: commercialId },
      });
    }
    const { error: dbErr } = await service
      .from('commerciaux')
      .update({
        stripe_account_id: accountId,
        siret: siretClean,
        ...(email ? { email } : {}),
        onboarding_status: 'pending',
      })
      .eq('id', commercialId);
    if (dbErr) {
      console.error('commercial banking db update failed', dbErr);
      return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500 });
    }

    const onboardingUrl = await createOnboardingLink(accountId, urls);
    return NextResponse.json({ ok: true, onboardingUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Création du compte Stripe échouée';
    console.error('commercial banking: Stripe call failed', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// GET — banking status, computed live from Stripe.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const commercialId = authenticateCommercialRequest(req, code);
  if (!commercialId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: com } = await service
    .from('commerciaux')
    .select('stripe_account_id, siret, onboarding_status, email, phone, city, company_name, vat_number, vrp_status, legal_form')
    .eq('id', commercialId)
    .maybeSingle();

  let onboardingComplete = false;
  let payoutsEnabled = false;
  if (com?.stripe_account_id) {
    try {
      const account = await stripe.accounts.retrieve(com.stripe_account_id);
      payoutsEnabled = account.payouts_enabled === true;
      onboardingComplete = account.details_submitted === true && account.charges_enabled === true;
      if (onboardingComplete && com.onboarding_status !== 'verified') {
        await service
          .from('commerciaux')
          .update({ onboarding_status: 'verified' })
          .eq('id', commercialId);
      }
    } catch (err) {
      console.error('commercial banking status lookup failed', err);
    }
  }

  return NextResponse.json({
    hasStripeAccount: !!com?.stripe_account_id,
    onboardingStatus: onboardingComplete ? 'verified' : (com?.onboarding_status ?? 'not_started'),
    siret: com?.siret ?? null,
    email: com?.email ?? null,
    phone: com?.phone ?? null,
    city: com?.city ?? null,
    companyName: com?.company_name ?? null,
    vatNumber: com?.vat_number ?? null,
    vrpStatus: com?.vrp_status ?? null,
    legalForm: com?.legal_form ?? null,
    pendingVerification: !!com?.stripe_account_id && !onboardingComplete,
    payoutsEnabled,
  });
}
