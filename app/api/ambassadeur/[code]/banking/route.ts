import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe/client';
import { verifyCookieValue } from '../auth/route';
import { sendAmbassadorBankingConfirmation } from '@/lib/email';
import { validateIban } from '@/lib/banking/iban';

export const runtime = 'nodejs';

function getSecret(): string | null {
  return process.env.AMBASSADOR_SESSION_SECRET ?? null;
}

async function authenticateAmbassador(req: NextRequest, code: string) {
  const cookieValue = req.cookies.get('amb_session')?.value;
  if (!cookieValue) return null;
  const secret = getSecret();
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

// POST — create Stripe Custom account + attach IBAN for this ambassador
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
  const {
    firstName, lastName, dob, address, iban, siret, email, phone, tosAccepted,
  } = body as {
    firstName?: string; lastName?: string;
    dob?: { day: number; month: number; year: number };
    address?: { line1: string; city: string; postal_code: string; country?: string };
    iban?: string; siret?: string; email?: string; phone?: string;
    tosAccepted?: boolean;
  };

  if (!firstName || !lastName) return NextResponse.json({ error: 'Nom complet requis' }, { status: 400 });
  if (!dob?.day || !dob.month || !dob.year) return NextResponse.json({ error: 'Date de naissance requise' }, { status: 400 });
  if (!address?.line1 || !address.city || !address.postal_code) {
    return NextResponse.json({ error: 'Adresse complète requise' }, { status: 400 });
  }
  const ibanResult = validateIban(iban);
  if (!ibanResult.ok) {
    return NextResponse.json({ error: ibanResult.error }, { status: 400 });
  }
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });
  if (!tosAccepted) return NextResponse.json({ error: 'Vous devez accepter les conditions Stripe' }, { status: 400 });

  const siretClean = siret ? validateSiret(siret) : null;
  if (!siretClean) {
    return NextResponse.json({
      error: "SIRET invalide. Pas encore de SIRET ? Crée-le gratuitement sur autoentrepreneur.urssaf.fr avant de continuer.",
    }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: amb } = await service
    .from('ambassadors')
    .select('id, stripe_account_id, name')
    .eq('id', ambassadorId)
    .maybeSingle();

  if (!amb) return NextResponse.json({ error: 'Ambassadeur introuvable' }, { status: 404 });
  if (amb.stripe_account_id) {
    return NextResponse.json({ error: 'Compte bancaire déjà configuré' }, { status: 400 });
  }

  const bankCountry = ibanResult.country;
  const addressCountry = (address.country ?? bankCountry).toUpperCase();
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0';

  let accountId: string;
  try {
    const account = await stripe.accounts.create({
      type: 'custom',
      country: bankCountry,
      business_type: 'individual',
      individual: {
        first_name: firstName,
        last_name: lastName,
        dob: { day: dob.day, month: dob.month, year: dob.year },
        address: { line1: address.line1, city: address.city, postal_code: address.postal_code, country: addressCountry },
        email,
        phone,
      },
      company: { tax_id: siretClean },
      tos_acceptance: { date: Math.floor(Date.now() / 1000), ip },
      capabilities: { transfers: { requested: true } },
      settings: { payouts: { schedule: { interval: 'manual' } } },
      metadata: { ambassador_id: ambassadorId, siret: siretClean },
    });
    accountId = account.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Création du compte Stripe échouée';
    console.error('ambassador stripe.accounts.create failed', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const ibanClean = ibanResult.normalized;
  try {
    await stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: 'bank_account',
        country: bankCountry,
        currency: 'eur',
        account_holder_name: `${firstName} ${lastName}`,
        account_holder_type: 'individual',
        account_number: ibanClean,
      } as Parameters<typeof stripe.accounts.createExternalAccount>[1]['external_account'],
    });
  } catch (err) {
    await stripe.accounts.del(accountId).catch(() => null);
    const msg = err instanceof Error ? err.message : 'IBAN refusé par Stripe';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { error: dbErr } = await service
    .from('ambassadors')
    .update({
      stripe_account_id: accountId,
      siret: siretClean,
      email,
      phone: phone ?? null,
      city: address.city,
      onboarding_status: 'complete',
    })
    .eq('id', ambassadorId);

  if (dbErr) {
    console.error('ambassador banking db update failed', dbErr);
    return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500 });
  }

  await sendAmbassadorBankingConfirmation({
    to: email,
    firstName,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

// GET — return banking status
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

  return NextResponse.json({
    hasStripeAccount: !!amb?.stripe_account_id,
    onboardingStatus: amb?.onboarding_status ?? 'not_started',
    siret: amb?.siret ?? null,
    email: amb?.email ?? null,
    phone: amb?.phone ?? null,
    city: amb?.city ?? null,
  });
}
