import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { createStandardAccount, createOnboardingLink } from '@/lib/stripe/connect';
import { getBaseUrl } from '@/lib/env';
import { verifyCookieValue } from '../auth/route';

export const runtime = 'nodejs';

async function authenticateAmbassador(req: NextRequest, code: string) {
  const cookieValue = req.cookies.get('amb_session')?.value;
  if (!cookieValue) return null;
  const secret = process.env.AMBASSADOR_SESSION_SECRET ?? null;
  if (!secret) return null;
  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) return null;
  return ambassadorId;
}

// SIRET format check: 14 digits only. No Luhn — see recruitment route for
// why (La Poste and a few other valid SIRETs fail standard Luhn).
function validateSiret(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  return /^\d{14}$/.test(clean) ? clean : null;
}

function ambassadorReturnUrls(code: string): { refresh_url: string; return_url: string } {
  const base = getBaseUrl();
  return {
    refresh_url: `${base}/ambassadeur/${code}?stripe=refresh`,
    return_url: `${base}/ambassadeur/${code}?stripe=return`,
  };
}

// POST — create the ambassador's Stripe Standard connected account and return
// a hosted-onboarding URL. Identity, IBAN and terms are collected by Stripe.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const ambassadorId = await authenticateAmbassador(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { siret, email } = body as { siret?: string; email?: string };

  // The SIRET stays a TipLink requirement (ambassadors are self-employed);
  // everything else is collected by Stripe's hosted onboarding.
  const siretClean = siret ? validateSiret(siret) : null;
  if (!siretClean) {
    return NextResponse.json({
      error: "SIRET invalide. Pas encore de SIRET ? Crée-le gratuitement sur autoentrepreneur.urssaf.fr avant de continuer.",
    }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: amb } = await service
    .from('ambassadors')
    .select('id, stripe_account_id')
    .eq('id', ambassadorId)
    .maybeSingle();

  if (!amb) return NextResponse.json({ error: 'Ambassadeur introuvable' }, { status: 404 });

  const urls = ambassadorReturnUrls(code);
  try {
    let accountId = amb.stripe_account_id;
    if (!accountId) {
      accountId = await createStandardAccount({
        email: email || undefined,
        metadata: { ambassador_id: ambassadorId },
      });
    }
    const { error: dbErr } = await service
      .from('ambassadors')
      .update({
        stripe_account_id: accountId,
        siret: siretClean,
        ...(email ? { email } : {}),
        onboarding_status: 'pending',
      })
      .eq('id', ambassadorId);
    if (dbErr) {
      console.error('ambassador banking db update failed', dbErr);
      return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500 });
    }

    const onboardingUrl = await createOnboardingLink(accountId, urls);
    return NextResponse.json({ ok: true, onboardingUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Création du compte Stripe échouée';
    console.error('ambassador banking: Stripe call failed', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// GET — banking status, computed live from Stripe.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const ambassadorId = await authenticateAmbassador(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: amb } = await service
    .from('ambassadors')
    .select('stripe_account_id, siret, onboarding_status, email, phone, city')
    .eq('id', ambassadorId)
    .maybeSingle();

  let onboardingComplete = false;
  let payoutsEnabled = false;
  if (amb?.stripe_account_id) {
    try {
      const account = await stripe.accounts.retrieve(amb.stripe_account_id);
      payoutsEnabled = account.payouts_enabled === true;
      onboardingComplete = account.details_submitted === true && account.charges_enabled === true;
      // Keep the stored status roughly in sync.
      if (onboardingComplete && amb.onboarding_status !== 'complete') {
        await service
          .from('ambassadors')
          .update({ onboarding_status: 'complete' })
          .eq('id', ambassadorId);
      }
    } catch (err) {
      console.error('ambassador banking status lookup failed', err);
    }
  }

  return NextResponse.json({
    hasStripeAccount: !!amb?.stripe_account_id,
    onboardingStatus: onboardingComplete ? 'complete' : (amb?.onboarding_status ?? 'not_started'),
    siret: amb?.siret ?? null,
    email: amb?.email ?? null,
    phone: amb?.phone ?? null,
    city: amb?.city ?? null,
    needsIdentityDocument: false,
    pendingVerification: !!amb?.stripe_account_id && !onboardingComplete,
    payoutsEnabled,
  });
}
